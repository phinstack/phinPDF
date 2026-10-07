//! The webview never sees file paths. When the user opens a file (picker or launch
//! argument), Rust records the path and gives the webview an opaque token. Only files
//! with an issued token can be read.

use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Matches `MAX_FILE_BYTES` in @phinpdf/platform.
pub const MAX_FILE_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct FileMeta {
    pub id: String,
    pub name: String,
    pub size: u64,
}

#[derive(Default)]
pub struct FileRegistry {
    inner: Mutex<Registry>,
}

#[derive(Default)]
struct Registry {
    next: u64,
    files: HashMap<String, PathBuf>,
}

impl FileRegistry {
    /// Validates a user-chosen path and issues a token for it.
    pub fn register(&self, path: &Path) -> Result<FileMeta, String> {
        let meta = fs::metadata(path).map_err(|e| format!("cannot open file: {e}"))?;
        if !meta.is_file() {
            return Err("not a regular file".into());
        }
        if meta.len() > MAX_FILE_BYTES {
            return Err("file too large".into());
        }
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "document.pdf".into());
        let mut reg = self.inner.lock().map_err(|_| "registry poisoned")?;
        reg.next += 1;
        let id = format!("file-{}", reg.next);
        reg.files.insert(id.clone(), path.to_path_buf());
        Ok(FileMeta {
            id,
            name,
            size: meta.len(),
        })
    }

    /// Reads a registered file. Rejects unknown tokens and anything that is not a PDF.
    pub fn read(&self, id: &str) -> Result<Vec<u8>, String> {
        let path = {
            let reg = self.inner.lock().map_err(|_| "registry poisoned")?;
            reg.files.get(id).cloned().ok_or("unknown file")?
        };
        // Re-check: the file may have changed since it was picked.
        let meta = fs::metadata(&path).map_err(|e| format!("cannot open file: {e}"))?;
        if !meta.is_file() || meta.len() > MAX_FILE_BYTES {
            return Err("file too large".into());
        }
        let bytes = fs::read(&path).map_err(|e| format!("cannot read file: {e}"))?;
        if !looks_like_pdf(&bytes) {
            return Err("not a PDF".into());
        }
        Ok(bytes)
    }
}

/// True if `%PDF-` appears in the first 1024 bytes (same rule as the renderer).
pub fn looks_like_pdf(bytes: &[u8]) -> bool {
    let head = &bytes[..bytes.len().min(1024)];
    head.windows(5).any(|w| w == b"%PDF-")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_file(contents: &[u8]) -> tempfile::NamedTempFile {
        let mut f = tempfile::Builder::new().suffix(".pdf").tempfile().unwrap();
        f.write_all(contents).unwrap();
        f
    }

    #[test]
    fn issues_tokens_and_reads_registered_pdfs() {
        let reg = FileRegistry::default();
        let f = temp_file(b"%PDF-1.7\n%%EOF\n");
        let meta = reg.register(f.path()).unwrap();
        assert_eq!(meta.size, 15);
        assert!(meta.name.ends_with(".pdf"));
        assert_eq!(reg.read(&meta.id).unwrap(), b"%PDF-1.7\n%%EOF\n");
    }

    #[test]
    fn issues_distinct_tokens() {
        let reg = FileRegistry::default();
        let f = temp_file(b"%PDF-1.7\n");
        let a = reg.register(f.path()).unwrap();
        let b = reg.register(f.path()).unwrap();
        assert_ne!(a.id, b.id);
    }

    #[test]
    fn rejects_unknown_tokens() {
        let reg = FileRegistry::default();
        assert_eq!(reg.read("file-1"), Err("unknown file".into()));
        assert_eq!(reg.read("../../etc/passwd"), Err("unknown file".into()));
    }

    #[test]
    fn rejects_non_pdf_content() {
        let reg = FileRegistry::default();
        let f = temp_file(b"MZ not a pdf");
        let meta = reg.register(f.path()).unwrap();
        assert_eq!(reg.read(&meta.id), Err("not a PDF".into()));
    }

    #[test]
    fn rejects_directories_and_missing_files() {
        let reg = FileRegistry::default();
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(reg.register(dir.path()), Err("not a regular file".into()));
        assert!(reg.register(&dir.path().join("missing.pdf")).is_err());
    }

    #[test]
    fn detects_pdf_header_within_first_kilobyte() {
        assert!(looks_like_pdf(b"%PDF-2.0"));
        let mut junk = vec![b'x'; 1000];
        junk.extend_from_slice(b"%PDF-1.4");
        assert!(looks_like_pdf(&junk));
        let mut far = vec![b'x'; 1020];
        far.extend_from_slice(b"%PDF-1.4");
        assert!(!looks_like_pdf(&far));
        assert!(!looks_like_pdf(b""));
    }
}
