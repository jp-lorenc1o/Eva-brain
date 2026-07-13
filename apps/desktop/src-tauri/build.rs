fn main() {
    // bundle.resources lists the Node tools staged by scripts/bundle-tools.mjs
    // (a `tauri build` step). Dev and test builds haven't run that staging, so
    // make sure the path exists before tauri-build validates the config.
    std::fs::create_dir_all("resources/eva-mcp").ok();
    tauri_build::build()
}
