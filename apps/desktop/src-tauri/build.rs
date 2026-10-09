const COMMANDS: &[&str] = &[
    "launch_file",
    "pick_file",
    "read_file",
    "save_file",
    "save_file_as",
    "set_unsaved_changes",
    "close_window",
];
const E2E_COMMANDS: &[&str] = &[
    "launch_file",
    "pick_file",
    "read_file",
    "save_file",
    "save_file_as",
    "set_unsaved_changes",
    "close_window",
    "e2e_report",
];

fn main() {
    // Declaring the commands makes Tauri require an explicit capability grant for each
    // one. Without this, every custom command is allowed by default (ADR-0003).
    let commands = if std::env::var_os("CARGO_FEATURE_E2E").is_some() {
        E2E_COMMANDS
    } else {
        COMMANDS
    };
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(commands)),
    )
    .expect("failed to run tauri-build");
}
