// Spike 3: Tauri shell that opens a PDF passed on the command line ("Open with"),
// hands the bytes to the webview over binary IPC, and lets PDF.js render it.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::ipc::Response;
use tauri::{Manager, State};

const MAX_PDF_BYTES: u64 = 512 * 1024 * 1024;

/// The only file the webview may read: the one the user opened.
struct OpenedFile(Mutex<Option<PathBuf>>);

#[tauri::command]
fn opened_file(state: State<OpenedFile>) -> Result<Response, String> {
    let path = state.0.lock().unwrap().clone().ok_or("no file was opened")?;
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.len() > MAX_PDF_BYTES {
        return Err("not a regular file, or too large".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    if !bytes.starts_with(b"%PDF-") {
        return Err("not a PDF".into());
    }
    // Raw binary response: no JSON/base64 encoding of the file.
    Ok(Response::new(bytes))
}

/// Spike harness only: print the webview's results and quit.
#[tauri::command]
fn report(app: tauri::AppHandle, result: serde_json::Value) {
    println!("SPIKE_RESULT {result}");
    app.exit(0);
}

fn main() {
    let opened = std::env::args_os().nth(1).map(PathBuf::from);
    tauri::Builder::default()
        .manage(OpenedFile(Mutex::new(opened)))
        .invoke_handler(tauri::generate_handler![opened_file, report])
        .setup(|app| {
            if let Some(w) = app.get_webview_window("main") {
                w.set_title("phinPDF spike")?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
