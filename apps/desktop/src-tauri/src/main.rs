#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Intentionally minimal plugin list: the frontend only needs a folder
    // picker (dialog) and read access to the chosen vault (fs).
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running eva-wiki");
}
