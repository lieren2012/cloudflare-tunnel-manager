#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

struct LocalService(Mutex<Option<Child>>);

fn main() {
    tauri::Builder::default()
        .manage(LocalService(Mutex::new(None)))
        .setup(|app| {
            let root = if cfg!(debug_assertions) {
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
            } else {
                app.path().resource_dir().map_err(|e| e.to_string())?
            };
            let data = app.path().app_data_dir().map_err(|e| e.to_string())?.join("data");
            std::fs::create_dir_all(&data).map_err(|e| e.to_string())?;
            let node = if cfg!(target_os = "windows") { "runtime/node.exe" } else { "runtime/node" };
            let node_path = if cfg!(debug_assertions) { std::path::PathBuf::from("node") } else { root.join(node) };
            let mut cmd = Command::new(node_path);
            cmd.arg(root.join("src/server.js"))
                .current_dir(&root)
                .env("DATA_DIR", &data)
                .env("APP_DIR", &root);
            let child = cmd.spawn().map_err(|e| format!("无法启动本地服务: {e}"))?;
            *app.state::<LocalService>().0.lock().unwrap() = Some(child);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(mut child) = app.state::<LocalService>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
