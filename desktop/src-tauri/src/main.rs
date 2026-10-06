#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{process::{Child,Command,Stdio},sync::Mutex,net::{TcpListener,TcpStream},io::{Read,Write},time::Duration};
use tauri::Manager;
struct LocalService(Mutex<Option<Child>>);
fn free_port() -> std::io::Result<u16> { Ok(TcpListener::bind("127.0.0.1:0")?.local_addr()?.port()) }
fn main() {
 tauri::Builder::default().manage(LocalService(Mutex::new(None))).setup(|app| {
  let root=app.path().resource_dir()?.join("runtime");
  let data=std::env::var_os("CFM_DESKTOP_DATA").map(std::path::PathBuf::from).unwrap_or(app.path().app_data_dir()?);
  std::fs::create_dir_all(data.join("data"))?;
  let port=free_port()?; let api=free_port()?; let mcp=free_port()?;
  let log=std::fs::File::create(data.join("service.log"))?;
  let mut cmd=Command::new(root.join(if cfg!(windows){"node.exe"}else{"node"}));
  cmd.arg(root.join("src/server.js")).current_dir(&root).env("DATA_DIR",data.join("data"))
   .env("APP_DIR",&root).env("CFM_BIND_HOST","127.0.0.1")
   .env("WEB_PORT",port.to_string()).env("API_PORT",api.to_string()).env("MCP_PORT",mcp.to_string())
   .env("CLOUDFLARED_PATH",root.join(if cfg!(windows){"cloudflared.exe"}else{"cloudflared"}))
   .stdout(Stdio::from(log.try_clone()?)).stderr(Stdio::from(log));
  #[cfg(windows)] { use std::os::windows::process::CommandExt; cmd.creation_flags(0x08000000); }
  let mut child=cmd.spawn()?;
  let mut ready=false;
  for _ in 0..100 {
   if let Some(status)=child.try_wait()? { return Err(format!("本地服务退出 {status}，请查看 {}",data.join("service.log").display()).into()); }
   if let Ok(mut stream)=TcpStream::connect_timeout(&format!("127.0.0.1:{port}").parse()?,Duration::from_millis(100)) {
    stream.set_read_timeout(Some(Duration::from_secs(1)))?;
    let _=stream.write_all(b"GET /api/auth/state HTTP/1.0\r\nHost: localhost\r\n\r\n");
    let mut response=String::new(); let _=stream.read_to_string(&mut response);
    if response.contains("\"needsSetup\"") {ready=true;break;}
   }
   std::thread::sleep(Duration::from_millis(100));
  }
  if !ready {let _=child.kill();return Err("本地服务未就绪，请查看 service.log".into());}
  *app.state::<LocalService>().0.lock().unwrap()=Some(child);
  let window=app.get_webview_window("main").ok_or("找不到桌面窗口")?;
  window.navigate(format!("http://127.0.0.1:{port}").parse()?)?;
  window.show()?;
  Ok(())
 }).build(tauri::generate_context!()).expect("桌面启动失败，请查看用户数据目录 service.log").run(|app,event| {
  if let tauri::RunEvent::Exit=event {if let Some(mut child)=app.state::<LocalService>().0.lock().unwrap().take(){let _=child.kill();let _=child.wait();}}
 });
}
