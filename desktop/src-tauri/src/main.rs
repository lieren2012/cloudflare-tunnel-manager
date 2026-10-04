#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

struct LocalService(Mutex<Option<Child>>);

fn main() {
    tauri::Builder::default()
        .manage(LocalService(Mutex::new(None)))
        .setup(|app| {
            // 开发阶段复用仓库 Node 服务；正式包由 runtime-bootstrap 写入资源目录后启动。
            #[cfg(debug_assertions)]
            {
                let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("../..");
                let child = Command::new("node")
                    .arg(root.join("src/server.js"))
                    .current_dir(&root)
                    .spawn()
                    .map_err(|e| format!("无法启动本地服务: {e}"))?;
                *app.state::<LocalService>().0.lock().unwrap() = Some(child);
            }
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
