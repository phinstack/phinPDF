mod files;

use files::{FileMeta, FileRegistry};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

/// Whether closing the window now would lose changes (set by the webview).
#[derive(Default)]
struct Unsaved(AtomicBool);

/// Sent to the webview when the user closes the window with unsaved changes.
const CLOSE_REQUESTED_EVENT: &str = "phinpdf://close-requested";

/// The raw request body (the PDF bytes); JSON bodies are refused.
fn raw_body(request: &Request<'_>) -> Result<Vec<u8>, String> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes.clone()),
        InvokeBody::Json(_) => Err("expected raw bytes".into()),
    }
}

fn header<'a>(request: &'a Request<'_>, name: &str) -> Result<&'a str, String> {
    request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| format!("missing {name} header"))
}

/// Saves over a file the user opened. The webview names it by token, never by path.
#[tauri::command]
fn save_file(request: Request<'_>, registry: State<FileRegistry>) -> Result<FileMeta, String> {
    let id = header(&request, "x-file-id")?;
    registry.write(id, &raw_body(&request)?)
}

/// Asks where to save (native dialog, shown from Rust) and writes the file there.
#[tauri::command]
async fn save_file_as(
    app: tauri::AppHandle,
    request: Request<'_>,
    registry: State<'_, FileRegistry>,
) -> Result<Option<FileMeta>, String> {
    let bytes = raw_body(&request)?;
    let suggested = header(&request, "x-file-name")
        .ok()
        .and_then(percent_decode)
        .map(|n| sanitize_file_name(&n))
        .unwrap_or_else(|| "document.pdf".into());
    let picked = app
        .dialog()
        .file()
        .add_filter("PDF documents", &["pdf", "PDF"])
        .set_file_name(suggested)
        .blocking_save_file();
    let Some(file) = picked else { return Ok(None) };
    let mut path = file.into_path().map_err(|e| e.to_string())?;
    if path.extension().is_none() {
        path.set_extension("pdf");
    }
    files::write_pdf(&path, &bytes)?;
    registry.register(&path).map(Some)
}

#[tauri::command]
fn set_unsaved_changes(unsaved: bool, state: State<Unsaved>) {
    state.0.store(unsaved, Ordering::SeqCst);
}

/// Closes the window after the webview has dealt with unsaved changes.
#[tauri::command]
fn close_window(window: tauri::Window, state: State<Unsaved>) -> Result<(), String> {
    state.0.store(false, Ordering::SeqCst);
    window.destroy().map_err(|e| e.to_string())
}

/// Decodes the percent-encoding applied by the webview (encodeURIComponent).
fn percent_decode(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = s.get(i + 1..i + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// Keeps only the final path component and drops characters no file system allows.
fn sanitize_file_name(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or("");
    let cleaned: String = base
        .chars()
        .filter(|c| !c.is_control() && !matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*'))
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    if trimmed.is_empty() {
        "document.pdf".into()
    } else {
        trimmed.into()
    }
}

/// The path the app was launched with ("Open with", double-click), taken once.
struct LaunchPath(Mutex<Option<PathBuf>>);

#[tauri::command]
fn launch_file(
    launch: State<LaunchPath>,
    registry: State<FileRegistry>,
) -> Result<Option<FileMeta>, String> {
    let path = launch.0.lock().map_err(|_| "state poisoned")?.take();
    path.map(|p| registry.register(&p)).transpose()
}

/// Shows the native open dialog from Rust. The webview has no dialog permission itself.
#[tauri::command]
async fn pick_file(
    app: tauri::AppHandle,
    registry: State<'_, FileRegistry>,
) -> Result<Option<FileMeta>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("PDF documents", &["pdf", "PDF"])
        .blocking_pick_file();
    match picked {
        None => Ok(None),
        Some(file) => {
            let path = file.into_path().map_err(|e| e.to_string())?;
            registry.register(&path).map(Some)
        }
    }
}

/// Returns raw bytes (no JSON or base64) for a file the user opened.
#[tauri::command]
fn read_file(id: String, registry: State<FileRegistry>) -> Result<Response, String> {
    registry.read(&id).map(Response::new)
}

#[cfg(feature = "e2e")]
#[tauri::command]
fn e2e_report(app: tauri::AppHandle, result: serde_json::Value) {
    println!("E2E_RESULT {result}");
    let ok = result.get("ok").and_then(serde_json::Value::as_bool) == Some(true);
    app.exit(if ok { 0 } else { 1 });
}

pub fn run() {
    // The first argument that isn't a flag is the file to open.
    let launch = std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .find(|p| !p.to_string_lossy().starts_with('-'));

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(LaunchPath(Mutex::new(launch)))
        .manage(FileRegistry::default())
        .manage(Unsaved::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.state::<Unsaved>().0.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.emit(CLOSE_REQUESTED_EVENT, ());
                }
            }
        });

    #[cfg(not(feature = "e2e"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        launch_file,
        pick_file,
        read_file,
        save_file,
        save_file_as,
        set_unsaved_changes,
        close_window
    ]);
    #[cfg(feature = "e2e")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        launch_file,
        pick_file,
        read_file,
        save_file,
        save_file_as,
        set_unsaved_changes,
        close_window,
        e2e_report
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running phinPDF");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_percent_encoding() {
        assert_eq!(percent_decode("a%20b.pdf").as_deref(), Some("a b.pdf"));
        assert_eq!(
            percent_decode("%C3%A9t%C3%A9.pdf").as_deref(),
            Some("été.pdf")
        );
        assert_eq!(percent_decode("bad%2"), None);
        assert_eq!(percent_decode("bad%zz"), None);
    }

    #[test]
    fn sanitizes_suggested_names() {
        assert_eq!(sanitize_file_name("report.pdf"), "report.pdf");
        assert_eq!(sanitize_file_name("../../etc/passwd"), "passwd");
        assert_eq!(sanitize_file_name("C:\\Users\\x\\a.pdf"), "a.pdf");
        assert_eq!(sanitize_file_name("a<b>:c?.pdf"), "abc.pdf");
        assert_eq!(sanitize_file_name(".."), "document.pdf");
        assert_eq!(sanitize_file_name(""), "document.pdf");
    }
}
