#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ingest;

fn main() {
    // Plugins: folder picker (dialog) + read access to the chosen vault (fs).
    // Ingest orchestration lives in the ingest module's commands — process
    // spawning and git mutation stay on the Rust side.
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ingest::SharedState::default())
        .manage(ingest::SharedQueryState::default())
        .invoke_handler(tauri::generate_handler![
            ingest::ingest_enqueue,
            ingest::ingest_decide,
            ingest::ensure_schema,
            ingest::vault_create,
            ingest::query_run,
            ingest::query_save,
            ingest::query_decide
        ])
        .run(tauri::generate_context!())
        .expect("error while running eva-wiki");
}
