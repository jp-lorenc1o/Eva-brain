#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ingest;

fn main() {
    // Plugins: folder picker (dialog) + read access to the chosen vault (fs).
    // Ingest orchestration lives in the ingest module's commands — process
    // spawning and git mutation stay on the Rust side.
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // A bundled Eva.app carries the Node lint/MCP tools as a resource;
            // resolve that location once so ingest never depends on the cwd.
            ingest::init_bundled_tools(app.handle());
            Ok(())
        })
        .manage(ingest::SharedState::default())
        .manage(ingest::SharedQueryState::default())
        .invoke_handler(tauri::generate_handler![
            ingest::ingest_enqueue,
            ingest::ingest_decide,
            ingest::ensure_schema,
            ingest::brain_create,
            ingest::brain_list,
            ingest::brain_import,
            ingest::brain_settings_get,
            ingest::brain_settings_update,
            ingest::query_run,
            ingest::health_check_run,
            ingest::profile_tool_run,
            ingest::query_save,
            ingest::query_decide
        ])
        .run(tauri::generate_context!())
        .expect("error while running Eva");
}
