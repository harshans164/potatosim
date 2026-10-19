use serde_json::Value;
use std::io::Write;
use std::process::{Command, Stdio};
use tauri::{Manager, path::BaseDirectory};

#[tauri::command]
async fn geometry_kernel(app: tauri::AppHandle, request: Value) -> Result<Value, String> {
    let bundled = app.path().resolve("python/geometry_kernel.py", BaseDirectory::Resource);
    let script = bundled.ok().filter(|path| path.exists()).unwrap_or_else(|| {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("python").join("geometry_kernel.py")
    });
    tauri::async_runtime::spawn_blocking(move || run_geometry_kernel(request, script))
        .await
        .map_err(|error| format!("Geometry task failed: {error}"))?
}

fn run_geometry_kernel(request: Value, script: std::path::PathBuf) -> Result<Value, String> {
    let mut child = Command::new("py")
        .args(["-3", script.to_string_lossy().as_ref()])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not start the OpenCascade service: {error}"))?;
    child.stdin.as_mut().ok_or("Geometry service input is unavailable")?
        .write_all(request.to_string().as_bytes())
        .map_err(|error| format!("Could not send model to geometry service: {error}"))?;
    let output = child.wait_with_output().map_err(|error| format!("Geometry service failed: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    serde_json::from_slice(&output.stdout).map_err(|error| format!("Invalid geometry service response: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![geometry_kernel])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
