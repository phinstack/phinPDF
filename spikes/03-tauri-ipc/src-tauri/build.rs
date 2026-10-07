fn main() {
    // Declaring the app's commands here means each one must be granted explicitly
    // in a capability file. Without this, Tauri allows every custom command.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["opened_file", "report"])),
    )
    .expect("failed to run tauri-build");
}
