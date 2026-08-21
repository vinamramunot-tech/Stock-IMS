// Premium, secure desktop stock management backend for Mava Gems.
// Re-implemented in pure Rust for high performance and minimal memory footprint.

mod db;

use std::sync::OnceLock;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use std::io::{Read, Write};
use flate2::Compression;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
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

// Encrypt raw binary buffer with 16-byte prepended IV
fn encrypt_data_bytes(plain_bytes: &[u8]) -> Result<Vec<u8>, String> {
    let key = get_encryption_key();
    let mut iv = [0u8; IV_LENGTH];
    rand::thread_rng().fill(&mut iv); // Cryptographically secure random IV
    
    let pt_len = plain_bytes.len();
    
    // Allocate buffer large enough for padded plaintext
    let mut buffer = vec![0u8; pt_len + 32];
    buffer[..pt_len].copy_from_slice(plain_bytes);
    
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

// Decrypt binary buffer into plaintext raw bytes
fn decrypt_data_bytes(buffer: &[u8]) -> Result<Vec<u8>, String> {
    if buffer.is_empty() {
        return Ok(Vec::new());
    }
    
    // Backward compatibility: If the file is plain JSON, return it directly
    if let Ok(utf8_str) = std::str::from_utf8(buffer) {
        let trimmed = utf8_str.trim();
        if trimmed.starts_with('{') {
            return Ok(buffer.to_vec());
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
        .map_err(|e| format!("Decryption failed: {:?}", e))?;
        
    Ok(decrypted.to_vec())
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
                        start_watching_db_file(handle.clone(), path_str.to_string());
                        return Some(path_str.to_string());
                    }
                }
            }
        }
    }
    
    // On mobile targets, return a default path in the document directory
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        if let Ok(doc_dir) = handle.path().document_dir() {
            let default_db_path = doc_dir.join("mava_gems_stock.db");
            let path_str = default_db_path.to_string_lossy().to_string();
            // Automatically write it as last path
            let config = serde_json::json!({
                "lastActiveDbPath": path_str
            });
            if let Ok(content) = serde_json::to_string_pretty(&config) {
                let _ = std::fs::create_dir_all(&config_dir);
                let _ = std::fs::write(&config_path, content);
            }
            return Some(path_str);
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
fn create_db_dialog(_handle: AppHandle) -> Option<String> {
    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    {
        let doc_dir = _handle.path().document_dir().ok();
        
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
fn export_backup_dialog(_handle: AppHandle, _default_name: Option<String>) -> Option<String> {
    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    {
        let doc_dir = _handle.path().document_dir().ok();
        let default_filename = _default_name.unwrap_or_else(|| "mava_gems_stock_backup.db".to_string());
        
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
fn convert_heic_to_jpeg(base64_heic: String) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose};
    let base64_str = if let Some(pos) = base64_heic.find(",") {
        &base64_heic[pos + 1..]
    } else {
        &base64_heic
    };
    let heic_bytes = general_purpose::STANDARD.decode(base64_str)
        .map_err(|e| format!("Failed to decode base64: {:?}", e))?;
    let jpg_bytes = convert_heic_bytes_to_jpeg_bytes(&heic_bytes)?;
    Ok(format!("data:image/jpeg;base64,{}", general_purpose::STANDARD.encode(&jpg_bytes)))
}

fn convert_heic_bytes_to_jpeg_bytes(heic_bytes: &[u8]) -> Result<Vec<u8>, String> {
    let temp_dir = std::env::temp_dir();
    let unique_id = format!("{}_{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos());
    let temp_heic = temp_dir.join(format!("input_{}.heic", unique_id));
    let temp_jpg = temp_dir.join(format!("output_{}.jpg", unique_id));

    std::fs::write(&temp_heic, heic_bytes)
        .map_err(|e| format!("Failed to write temp HEIC file: {:?}", e))?;

    let output = std::process::Command::new("sips")
        .arg("-s")
        .arg("format")
        .arg("jpeg")
        .arg("-s")
        .arg("formatOptions")
        .arg("90")
        .arg("-z")
        .arg("1200")
        .arg("1200")
        .arg(&temp_heic)
        .arg("--out")
        .arg(&temp_jpg)
        .output();

    let _ = std::fs::remove_file(&temp_heic);

    let output = match output {
        Ok(out) => out,
        Err(e) => {
            let _ = std::fs::remove_file(&temp_jpg);
            return Err(format!("Failed to execute sips: {:?}", e));
        }
    };

    if !output.status.success() {
        let _ = std::fs::remove_file(&temp_jpg);
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("sips conversion failed: {}", err_msg));
    }

    let jpg_bytes = std::fs::read(&temp_jpg)
        .map_err(|e| format!("Failed to read temp JPEG file: {:?}", e))?;

    let _ = std::fs::remove_file(&temp_jpg);
    Ok(jpg_bytes)
}

fn convert_db_heic_images(val: &mut serde_json::Value) {
    use base64::{Engine as _, engine::general_purpose};
    if let Some(obj) = val.as_object_mut() {
        for array_key in &["items", "emeralds", "stones"] {
            if let Some(arr) = obj.get_mut(*array_key).and_then(|v| v.as_array_mut()) {
                for item in arr {
                    if let Some(item_obj) = item.as_object_mut() {
                        if let Some(img_val) = item_obj.get_mut("image") {
                            if let Some(s) = img_val.as_str() {
                                if s.starts_with("data:image/heic") || s.starts_with("data:image/heif") {
                                    let base64_str = if let Some(pos) = s.find(",") {
                                        &s[pos + 1..]
                                    } else {
                                        s
                                    };
                                    if let Ok(heic_bytes) = general_purpose::STANDARD.decode(base64_str) {
                                        if let Ok(jpg_bytes) = convert_heic_bytes_to_jpeg_bytes(&heic_bytes) {
                                            let jpg_base64 = general_purpose::STANDARD.encode(&jpg_bytes);
                                            *img_val = serde_json::Value::String(format!("data:image/jpeg;base64,{}", jpg_base64));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

pub fn parse_vault_bytes(raw_buffer: &[u8]) -> Result<String, String> {
    if raw_buffer.is_empty() {
        return Ok(serde_json::json!({
            "settings": {},
            "items": [],
            "emeralds": [],
            "memos": [],
            "stones": [],
            "jewelStoneMemos": [],
            "jewelryMemos": [],
            "logs": []
        }).to_string());
    }

    let decrypted = match decrypt_data_bytes(raw_buffer) {
        Ok(bytes) => bytes,
        Err(_) => raw_buffer.to_vec(),
    };

    // Check for Gzip magic bytes: [0x1f, 0x8b]
    let decompressed = if decrypted.len() >= 2 && decrypted[0] == 0x1f && decrypted[1] == 0x8b {
        let mut decoder = GzDecoder::new(&decrypted[..]);
        let mut decompressed_bytes = Vec::new();
        if decoder.read_to_end(&mut decompressed_bytes).is_ok() {
            decompressed_bytes
        } else {
            decrypted
        }
    } else {
        decrypted
    };

    let mut raw_json_val: Option<serde_json::Value> = None;

    // 1. Try UTF-8 string from decompressed bytes (plain or Gzip JSON string)
    if let Ok(s) = String::from_utf8(decompressed.clone()) {
        let trimmed = s.trim();
        if trimmed.starts_with('{') && trimmed.ends_with('}') {
            if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                if json_val.is_object() {
                    raw_json_val = Some(json_val);
                }
            }
        }
    }

    // 2. Try MessagePack deserialization into VaultDatabase struct
    if raw_json_val.is_none() {
        if let Ok(bin_db) = rmp_serde::from_slice::<db::VaultDatabase>(&decompressed) {
            if let Ok(json_val) = serde_json::to_value(&bin_db) {
                if json_val.is_object() {
                    raw_json_val = Some(json_val);
                }
            }
        }
    }

    // 3. Try MessagePack deserialization into generic serde_json::Value (must be a JSON Object)
    if raw_json_val.is_none() {
        if let Ok(bin_val) = rmp_serde::from_slice::<serde_json::Value>(&decompressed) {
            if bin_val.is_object() {
                raw_json_val = Some(bin_val);
            }
        }
    }

    // 4. Try UTF-8 string from raw unencrypted buffer
    if raw_json_val.is_none() {
        if let Ok(s) = String::from_utf8(raw_buffer.to_vec()) {
            let trimmed = s.trim();
            if trimmed.starts_with('{') && trimmed.ends_with('}') {
                if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    if json_val.is_object() {
                        raw_json_val = Some(json_val);
                    }
                }
            }
        }
    }

    if let Some(mut val) = raw_json_val {
        convert_db_heic_images(&mut val);
        return Ok(val.to_string());
    }

    Err("Database payload is unreadable (neither MessagePack nor valid JSON)".to_string())
}

#[tauri::command]
async fn read_vault(handle: AppHandle, custom_path: String) -> Result<serde_json::Value, String> {
    let custom_path_clone = custom_path.clone();
    let read_result = tokio::task::spawn_blocking(move || {
        let file_path = std::path::Path::new(&custom_path_clone);
        if !file_path.exists() {
            return Ok(None);
        }

        let raw_buffer = std::fs::read(file_path)
            .map_err(|e| format!("Failed to read file: {:?}", e))?;

        let json_str = match parse_vault_bytes(&raw_buffer) {
            Ok(data) => data,
            Err(err) => {
                // Automatic backup recovery attempt if main file is unreadable
                let backup_path = format!("{}.bak", custom_path_clone);
                let b_path = std::path::Path::new(&backup_path);
                if b_path.exists() {
                    if let Ok(b_buffer) = std::fs::read(b_path) {
                        if let Ok(b_data) = parse_vault_bytes(&b_buffer) {
                            // Successfully recovered from backup! Overwrite corrupted main file with backup.
                            let _ = std::fs::copy(b_path, file_path);
                            return Ok(Some(b_data));
                        }
                    }
                }
                return Err(err);
            }
        };

        Ok(Some(json_str))
    })
    .await
    .map_err(|e| format!("Task join error: {:?}", e))?;

    match read_result? {
        Some(json_str) => {
            start_watching_db_file(handle, custom_path.clone());
            Ok(serde_json::json!({
                "exists": true,
                "data": json_str,
                "path": custom_path
            }))
        }
        None => {
            Ok(serde_json::json!({ "exists": false, "data": null }))
        }
    }
}

#[tauri::command]
async fn write_vault(handle: AppHandle, payload: String, custom_path: String) -> Result<serde_json::Value, String> {
    stop_watching_db_file();
    
    let custom_path_clone = custom_path.clone();
    let write_result = tokio::task::spawn_blocking(move || {
        let file_path = std::path::Path::new(&custom_path_clone);
        if let Some(parent) = file_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        
        let parsed: db::VaultDatabase = serde_json::from_str(&payload)
            .map_err(|e| format!("Failed to parse database payload: {:?}", e))?;
            
        let binary_data = rmp_serde::to_vec(&parsed)
            .map_err(|e| format!("Serialization error: {:?}", e))?;
            
        // Use fast compression to optimize save speed
        let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
        encoder.write_all(&binary_data)
            .map_err(|e| format!("Compression failed: {:?}", e))?;
        let compressed_data = encoder.finish()
            .map_err(|e| format!("Compression finish failed: {:?}", e))?;
            
        let encrypted_buffer = encrypt_data_bytes(&compressed_data)?;
        
        let temp_path_str = format!("{}.tmp", custom_path_clone);
        let temp_path = std::path::Path::new(&temp_path_str);
        
        std::fs::write(temp_path, &encrypted_buffer)
            .map_err(|e| format!("Failed to write temp file: {:?}", e))?;
            
        if file_path.exists() {
            let backup_path_str = format!("{}.bak", custom_path_clone);
            let backup_path = std::path::Path::new(&backup_path_str);
            let _ = std::fs::copy(file_path, backup_path);
        }
        
        std::fs::rename(temp_path, file_path)
            .map_err(|e| format!("Failed to complete write atomically: {:?}", e))?;
            
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("Task join error: {:?}", e))?;
    
    write_result?;
    
    start_watching_db_file(handle, custom_path.clone());
    
    Ok(serde_json::json!({
        "success": true,
        "path": custom_path
    }))
}

#[tauri::command]
async fn import_db_file(handle: AppHandle, base64_data: String, custom_path: String) -> Result<bool, String> {
    let base64_data_clone = base64_data.clone();
    let decompressed_result = tokio::task::spawn_blocking(move || {
        use base64::{Engine as _, engine::general_purpose};
        
        let buffer = general_purpose::STANDARD.decode(&base64_data_clone)
            .map_err(|e| format!("Failed to decode base64: {:?}", e))?;
            
        let decrypted = match decrypt_data_bytes(&buffer) {
            Ok(bytes) => bytes,
            Err(_) => buffer.clone()
        };
        
        let decompressed = if decrypted.len() >= 2 && decrypted[0] == 0x1f && decrypted[1] == 0x8b {
            let mut decoder = GzDecoder::new(&decrypted[..]);
            let mut decompressed_bytes = Vec::new();
            if decoder.read_to_end(&mut decompressed_bytes).is_ok() {
                decompressed_bytes
            } else {
                decrypted
            }
        } else {
            decrypted
        };
        
        Ok::<Vec<u8>, String>(decompressed)
    })
    .await
    .map_err(|e| format!("Task join error: {:?}", e))??;

    let handle_clone = handle.clone();
    let custom_path_clone = custom_path.clone();
    let save_result = tokio::task::spawn_blocking(move || {
        let is_valid = if rmp_serde::from_slice::<db::VaultDatabase>(&decompressed_result).is_ok() {
            true
        } else if let Ok(utf8_str) = std::str::from_utf8(&decompressed_result) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(utf8_str) {
                parsed.get("settings").is_some() && parsed.get("items").is_some()
            } else {
                false
            }
        } else {
            false
        };
        
        if is_valid {
            let json_str = if let Ok(bin_db) = rmp_serde::from_slice::<db::VaultDatabase>(&decompressed_result) {
                serde_json::to_string(&bin_db)
                    .map_err(|e| format!("Serialization error: {:?}", e))?
            } else if let Ok(utf8_str) = std::str::from_utf8(&decompressed_result) {
                utf8_str.to_string()
            } else {
                return Err("Invalid database format".to_string());
            };
            Ok(json_str)
        } else {
            Err("The selected file is not a valid Mava Gems database.".to_string())
        }
    })
    .await
    .map_err(|e| format!("Task join error: {:?}", e))??;

    write_vault(handle_clone, save_result, custom_path_clone).await?;
    Ok(true)
}

#[tauri::command]
async fn copy_file(source_path: String, dest_path: String) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || {
        std::fs::copy(&source_path, &dest_path)
            .map_err(|e| format!("Failed to copy file: {:?}", e))?;
        Ok::<bool, String>(true)
    })
    .await
    .map_err(|e| format!("Task join error: {:?}", e))?
}

#[tauri::command]
fn save_file_dialog(_handle: AppHandle, _default_name: String) -> Option<String> {
    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    {
        let doc_dir = _handle.path().document_dir().ok();
        let ext = std::path::Path::new(&_default_name)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("pdf");

        let mut dialog = FileDialog::new();
        if ext == "png" {
            dialog = dialog.set_title("Save Image").add_filter("PNG Image", &["png"]);
        } else if ext == "xlsx" {
            dialog = dialog.set_title("Save Excel Report").add_filter("Excel Spreadsheet", &["xlsx"]);
        } else {
            dialog = dialog.set_title("Save PDF Report").add_filter("PDF Document", &["pdf"]);
        }
            
        if let Some(path) = doc_dir {
            dialog = dialog.set_directory(path);
        }
        dialog = dialog.set_file_name(&_default_name);
        
        dialog.save_file().map(|p| p.to_string_lossy().to_string())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        None
    }
}

#[tauri::command]
async fn save_pdf_file(base64_data: String, path: String) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || {
        use base64::{Engine as _, engine::general_purpose};
        let buffer = general_purpose::STANDARD.decode(&base64_data)
            .map_err(|e| format!("Failed to decode base64: {:?}", e))?;
        std::fs::write(path, buffer)
            .map_err(|e| format!("Failed to save PDF file: {:?}", e))?;
        Ok::<bool, String>(true)
    })
    .await
    .map_err(|e| format!("Task join error: {:?}", e))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Only register the log plugin on desktop platforms.
            // On iOS, debug_assertions may still be true even in release cargo builds,
            // and the log plugin can cause OnceLock initialization failure panics.
            #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
            if cfg!(debug_assertions) {
                let _ = app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                );
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
            copy_file,
            import_db_file,
            save_file_dialog,
            save_pdf_file,
            convert_heic_to_jpeg
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn test_db_compression_and_encryption() {
        // Create a mock large database payload (settings + items + logs)
        let mut items = Vec::new();
        for i in 0..50000 {
            items.push(serde_json::json!({
                "id": format!("item_{}", i),
                "name": "Luxury Diamond Ring 18K Gold",
                "price": 25000 + i,
                "weight": 4.5,
                "status": "In Stock",
                "details": {
                    "clarity": "VVS1",
                    "color": "D",
                    "cut": "Excellent"
                }
            }));
        }

        let database = db::VaultDatabase {
            settings: serde_json::json!({
                "currency": "₹",
                "goldRate24kt": {
                    "ratePerGram": 6500.0,
                    "effectiveDate": "2026-07-30"
                }
            }),
            items,
            emeralds: vec![],
            memos: vec![],
            stones: vec![],
            jewel_stone_memos: vec![],
            jewelry_memos: vec![],
            logs: vec![],
        };

        // Serialize to MessagePack
        let start_rmp = Instant::now();
        let binary_data = rmp_serde::to_vec(&database).unwrap();
        let elapsed_rmp = start_rmp.elapsed();
        println!("MsgPack serialization took: {:?}", elapsed_rmp);

        // Compare Compression::default() vs Compression::fast()
        let start_comp_default = Instant::now();
        let mut encoder_default = GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder_default.write_all(&binary_data).unwrap();
        let compressed_default = encoder_default.finish().unwrap();
        let elapsed_comp_default = start_comp_default.elapsed();

        let start_comp_fast = Instant::now();
        let mut encoder_fast = GzEncoder::new(Vec::new(), flate2::Compression::fast());
        encoder_fast.write_all(&binary_data).unwrap();
        let compressed_fast = encoder_fast.finish().unwrap();
        let elapsed_comp_fast = start_comp_fast.elapsed();

        println!("Compression::default() took: {:?} (size: {} bytes)", elapsed_comp_default, compressed_default.len());
        println!("Compression::fast() took: {:?} (size: {} bytes)", elapsed_comp_fast, compressed_fast.len());

        // Encrypt with our AES implementation
        let start_enc = Instant::now();
        let encrypted = encrypt_data_bytes(&compressed_fast).unwrap();
        let elapsed_enc = start_enc.elapsed();
        println!("Encryption took: {:?}", elapsed_enc);

        // Decrypt and decompress
        let start_dec = Instant::now();
        let decrypted = decrypt_data_bytes(&encrypted).unwrap();
        let mut decoder = GzDecoder::new(&decrypted[..]);
        let mut decompressed = Vec::new();
        decoder.read_to_end(&mut decompressed).unwrap();
        let elapsed_dec = start_dec.elapsed();
        println!("Decryption & Decompression took: {:?}", elapsed_dec);

        assert_eq!(decompressed, binary_data);

        // Deserialize back to VaultDatabase
        let deserialized: db::VaultDatabase = rmp_serde::from_slice(&decompressed).unwrap();
        assert_eq!(deserialized.items.len(), 50000);
    }
}
