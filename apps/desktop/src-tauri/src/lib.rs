mod files;

use files::{FileMeta, FileRegistry};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::ipc::Response;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

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
        .manage(FileRegistry::default());

    #[cfg(not(feature = "e2e"))]
    let builder =
        builder.invoke_handler(tauri::generate_handler![launch_file, pick_file, read_file]);
    #[cfg(feature = "e2e")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        launch_file,
        pick_file,
        read_file,
        e2e_report
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running phinPDF");
}
