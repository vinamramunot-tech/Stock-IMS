// Premium, secure desktop stock management backend for Mava Gems.
// Re-implemented in pure Rust for high performance and minimal memory footprint.

use std::sync::OnceLock;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use aes::Aes256;
use aes::cipher::{block_padding::Pkcs7, typenum::{U16, U32}, BlockDecryptMut, BlockEncryptMut, KeyIvInit, generic_array::GenericArray};
use sha2::{Digest, Sha256};
use rand::Rng;
#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
use rfd::FileDialog;
use tauri::{AppHandle, Emitter, Manager};

// AES-256 secure encryption configuration
const APP_SECRET: &str = "mava-gems-luxury-jewelry-vault-security-key-2026";
const IV_LENGTH: usize = 16;

type Aes256CbcEnc = cbc::Encryptor<Aes256>;
type Aes256CbcDec = cbc::Decryptor<Aes256>;

// Retrieve SHA-256 derived key (exactly 32 bytes) matching Node.js crypto
fn get_encryption_key() -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(APP_SECRET.as_bytes());
    hasher.finalize().to_vec()
}

// Encrypt plaintext string into secure binary buffer with 16-byte prepended IV
fn encrypt_data(plain_text: &str) -> Result<Vec<u8>, String> {
    let key = get_encryption_key();
    let mut iv = [0u8; IV_LENGTH];
    rand::thread_rng().fill(&mut iv); // Cryptographically secure random IV
    
    let plaintext_bytes = plain_text.as_bytes();
    let pt_len = plaintext_bytes.len();
    
    // Allocate buffer large enough for padded plaintext
    let mut buffer = vec![0u8; pt_len + 32];
    buffer[..pt_len].copy_from_slice(plaintext_bytes);
    
    let key_array: GenericArray<u8, U32> = GenericArray::clone_from_slice(&key);
    let iv_array: GenericArray<u8, U16> = GenericArray::clone_from_slice(&iv);
    
    let ciphertext = Aes256CbcEnc::new(&key_array, &iv_array)
        .encrypt_padded_mut::<Pkcs7>(&mut buffer, pt_len)
        .map_err(|e| format!("Encryption error: {:?}", e))?;
        
    let mut result = Vec::new();
    result.extend_from_slice(&iv);
    result.extend_from_slice(ciphertext);
    Ok(result)
}

// Decrypt binary buffer into plaintext string
fn decrypt_data(buffer: &[u8]) -> Result<String, String> {
    if buffer.is_empty() {
        return Ok(String::new());
    }
    
    // Backward compatibility: If the file is plain JSON, return it as string directly
    if let Ok(utf8_str) = std::str::from_utf8(buffer) {
        let trimmed = utf8_str.trim();
        if trimmed.starts_with('{') {
            return Ok(utf8_str.to_string());
        }
    }
    
    if buffer.len() < IV_LENGTH {
        return Err("Buffer too short to contain IV".to_string());
    }
    
    let iv = &buffer[..IV_LENGTH];
    let ciphertext = &buffer[IV_LENGTH..];
    
    let key = get_encryption_key();
    let mut decrypt_buffer = ciphertext.to_vec();
    
    let key_array: GenericArray<u8, U32> = GenericArray::clone_from_slice(&key);
    let iv_array: GenericArray<u8, U16> = GenericArray::clone_from_slice(iv);
    
    let decrypted = Aes256CbcDec::new(&key_array, &iv_array)
        .decrypt_padded_mut::<Pkcs7>(&mut decrypt_buffer)
        .map_err(|e| format!("Decryption failed. The file may be corrupted or key mismatched. Details: {:?}", e))?;
        
    String::from_utf8(decrypted.to_vec())
        .map_err(|e| format!("Decrypted data is not valid UTF-8: {:?}", e))
}

// --- Background File Watcher System ---
static WATCHER_CANCEL: OnceLock<Arc<AtomicBool>> = OnceLock::new();
static CURRENT_WATCHED_FILE: OnceLock<Mutex<Option<String>>> = OnceLock::new();

fn get_watcher_cancel() -> &'static Arc<AtomicBool> {
    WATCHER_CANCEL.get_or_init(|| Arc::new(AtomicBool::new(false)))
}

fn get_current_watched_file() -> &'static Mutex<Option<String>> {
    CURRENT_WATCHED_FILE.get_or_init(|| Mutex::new(None))
}

fn stop_watching_db_file() {
    let cancel = get_watcher_cancel();
    cancel.store(true, Ordering::SeqCst);
    
    if let Ok(mut guard) = get_current_watched_file().lock() {
        *guard = None;
    }
}

fn start_watching_db_file(handle: AppHandle, path: String) {
    // 1. Check if we are already watching this exact file
    if let Ok(guard) = get_current_watched_file().lock() {
        if let Some(ref current_path) = *guard {
            if current_path == &path {
                return; // Already watching this file
            }
        }
    }
    
    // 2. Stop any existing watcher
    stop_watching_db_file();
    
    // Reset cancel flag
    let cancel = get_watcher_cancel();
    cancel.store(false, Ordering::SeqCst);
    
    // Set current watched file
    if let Ok(mut guard) = get_current_watched_file().lock() {
        *guard = Some(path.clone());
    }
    
    // Clone cancel flag and handle for background polling
    let thread_cancel = cancel.clone();
    let thread_path = path.clone();
    
    thread::spawn(move || {
        let path_obj = std::path::Path::new(&thread_path);
        let mut last_modified = std::fs::metadata(path_obj)
            .ok()
            .and_then(|m| m.modified().ok());
            
        while !thread_cancel.load(Ordering::SeqCst) {
            thread::sleep(Duration::from_millis(1000));
            
            if thread_cancel.load(Ordering::SeqCst) {
                break;
            }
            
            // Check file modification time
            if let Ok(metadata) = std::fs::metadata(path_obj) {
                if let Ok(modified) = metadata.modified() {
                    if let Some(last_time) = last_modified {
                        if modified > last_time {
                            // File was changed externally! Emit event to frontend
                            let _ = handle.emit("database-file-changed", thread_path.clone());
                            last_modified = Some(modified);
                        }
                    } else {
                        last_modified = Some(modified);
                    }
                }
            }
        }
    });
}

// --- Tauri Commands (IPC Handlers) ---

#[tauri::command]
fn get_last_db_path(handle: AppHandle) -> Option<String> {
    let config_dir = handle.path().app_config_dir().ok()?;
    let config_path = config_dir.join("app_config.json");
    if config_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&config_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(path_str) = json.get("lastActiveDbPath").and_then(|v| v.as_str()) {
                    if std::path::Path::new(path_str).exists() {
                        start_watching_db_file(handle, path_str.to_string());
                        return Some(path_str.to_string());
                    }
                }
            }
        }
    }
    None
}

#[tauri::command]
fn set_last_db_path(handle: AppHandle, db_path: Option<String>) -> bool {
    let config_dir = match handle.path().app_config_dir() {
        Ok(dir) => dir,
        Err(_) => return false,
    };
    if !config_dir.exists() {
        let _ = std::fs::create_dir_all(&config_dir);
    }
    let config_path = config_dir.join("app_config.json");
    let config = serde_json::json!({
        "lastActiveDbPath": db_path
    });
    
    if let Ok(content) = serde_json::to_string_pretty(&config) {
        if std::fs::write(&config_path, content).is_ok() {
            if let Some(ref path) = db_path {
                start_watching_db_file(handle, path.clone());
            } else {
                stop_watching_db_file();
            }
            return true;
        }
    }
    false
}

#[tauri::command]
fn create_db_dialog(handle: AppHandle) -> Option<String> {
    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    {
        let doc_dir = handle.path().document_dir().ok();
        
        let mut dialog = FileDialog::new()
            .set_title("Create New Mava Gems Database")
            .add_filter("Mava Gems Database", &["db", "json"])
            .add_filter("All Files", &["*"]);
            
        if let Some(ref path) = doc_dir {
            dialog = dialog.set_directory(path).set_file_name("mava_gems_stock.db");
        }
        
        dialog.save_file().map(|p| p.to_string_lossy().to_string())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        None
    }
}

#[tauri::command]
fn open_db_dialog() -> Option<String> {
    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    {
        FileDialog::new()
            .set_title("Open Existing Mava Gems Database")
            .add_filter("Mava Gems Database", &["db", "json"])
            .add_filter("All Files", &["*"])
            .pick_file()
            .map(|p| p.to_string_lossy().to_string())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        None
    }
}

#[tauri::command]
fn select_directory() -> Option<String> {
    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    {
        FileDialog::new()
            .set_title("Select Folder for Mava Gems Database")
            .pick_folder()
            .map(|p| p.to_string_lossy().to_string())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        None
    }
}

#[tauri::command]
fn export_backup_dialog(handle: AppHandle, default_name: Option<String>) -> Option<String> {
    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    {
        let doc_dir = handle.path().document_dir().ok();
        let default_filename = default_name.unwrap_or_else(|| "mava_gems_stock_backup.db".to_string());
        
        let mut dialog = FileDialog::new()
            .set_title("Export Database Backup")
            .add_filter("Mava Gems Database", &["db", "json"])
            .add_filter("All Files", &["*"]);
            
        if let Some(path) = doc_dir {
            dialog = dialog.set_directory(path);
        }
        dialog = dialog.set_file_name(&default_filename);
        
        dialog.save_file().map(|p| p.to_string_lossy().to_string())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        None
    }
}

#[tauri::command]
fn import_backup_dialog() -> Option<String> {
    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    {
        FileDialog::new()
            .set_title("Import Database Backup")
            .add_filter("Mava Gems Database", &["db", "json"])
            .add_filter("All Files", &["*"])
            .pick_file()
            .map(|p| p.to_string_lossy().to_string())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        None
    }
}

#[tauri::command]
fn read_vault(handle: AppHandle, custom_path: String) -> Result<serde_json::Value, String> {
    let file_path = std::path::Path::new(&custom_path);
    if !file_path.exists() {
        return Ok(serde_json::json!({ "exists": false, "data": null }));
    }
    
    let raw_buffer = std::fs::read(file_path)
        .map_err(|e| format!("Failed to read file: {:?}", e))?;
    let decrypted = decrypt_data(&raw_buffer)?;
    
    start_watching_db_file(handle, custom_path.clone());
    
    Ok(serde_json::json!({
        "exists": true,
        "data": decrypted,
        "path": custom_path
    }))
}

#[tauri::command]
fn write_vault(handle: AppHandle, payload: String, custom_path: String) -> Result<serde_json::Value, String> {
    stop_watching_db_file();
    
    let file_path = std::path::Path::new(&custom_path);
    if let Some(parent) = file_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    
    let encrypted_buffer = encrypt_data(&payload)?;
    
    let temp_path_str = format!("{}.tmp", custom_path);
    let temp_path = std::path::Path::new(&temp_path_str);
    
    std::fs::write(temp_path, &encrypted_buffer)
        .map_err(|e| format!("Failed to write temp file: {:?}", e))?;
        
    if file_path.exists() {
        let backup_path_str = format!("{}.bak", custom_path);
        let backup_path = std::path::Path::new(&backup_path_str);
        let _ = std::fs::copy(file_path, backup_path);
    }
    
    std::fs::rename(temp_path, file_path)
        .map_err(|e| format!("Failed to complete write atomically: {:?}", e))?;
        
    start_watching_db_file(handle, custom_path.clone());
    
    Ok(serde_json::json!({
        "success": true,
        "path": custom_path
    }))
}

#[tauri::command]
fn copy_file(source_path: String, dest_path: String) -> Result<bool, String> {
    std::fs::copy(&source_path, &dest_path)
        .map_err(|e| format!("Failed to copy file: {:?}", e))?;
    Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_last_db_path,
            set_last_db_path,
            create_db_dialog,
            open_db_dialog,
            select_directory,
            export_backup_dialog,
            import_backup_dialog,
            read_vault,
            write_vault,
            copy_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
