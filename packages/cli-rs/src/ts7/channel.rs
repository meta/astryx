//! The synchronous tuple channel to the TypeScript 7 compiler process.
//!
//! Each message is a MessagePack array of three items: the message type (a
//! positive fixint or uint8), the method name (bin) and the payload (bin).
//! The parent sends requests; the child answers with a response or an error,
//! and may first call back into the parent (file system callbacks).

use std::collections::HashMap;
use std::io::{BufReader, BufWriter, Read, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

const MSG_REQUEST: u8 = 1;
const MSG_CALL_RESPONSE: u8 = 2;
const MSG_CALL_ERROR: u8 = 3;
const MSG_RESPONSE: u8 = 4;
const MSG_ERROR: u8 = 5;
const MSG_CALL: u8 = 6;

const FIXARRAY3: u8 = 0x93;
const UINT8: u8 = 0xcc;
const BIN8: u8 = 0xc4;
const BIN16: u8 = 0xc5;
const BIN32: u8 = 0xc6;

/// A string-to-string callback the child may invoke by name.
pub type Callback = Box<dyn FnMut(&str) -> Result<String, String>>;

pub struct Channel {
    child: Child,
    reader: BufReader<ChildStdout>,
    writer: Option<BufWriter<ChildStdin>>,
    callbacks: HashMap<String, Callback>,
}

#[derive(Debug)]
pub struct ChannelError(pub String);

impl std::fmt::Display for ChannelError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for ChannelError {}

fn io_err(e: std::io::Error) -> ChannelError {
    ChannelError(e.to_string())
}

fn write_bin_header(buf: &mut Vec<u8>, len: usize) {
    if len < 0x100 {
        buf.push(BIN8);
        buf.push(len as u8);
    } else if len < 0x10000 {
        buf.push(BIN16);
        buf.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        buf.push(BIN32);
        buf.extend_from_slice(&(len as u32).to_be_bytes());
    }
}

impl Channel {
    /// Spawn `exe args...` with piped stdin/stdout; stderr is inherited, as
    /// the Node client does.
    pub fn spawn(exe: &str, args: &[String]) -> Result<Channel, ChannelError> {
        let mut child = Command::new(exe)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(io_err)?;
        let stdin = child.stdin.take().ok_or_else(|| ChannelError("no stdin".into()))?;
        let stdout = child.stdout.take().ok_or_else(|| ChannelError("no stdout".into()))?;
        Ok(Channel {
            child,
            reader: BufReader::with_capacity(1 << 16, stdout),
            writer: Some(BufWriter::with_capacity(1 << 16, stdin)),
            callbacks: HashMap::new(),
        })
    }

    pub fn register_callback(&mut self, name: &str, cb: Callback) {
        self.callbacks.insert(name.to_string(), cb);
    }

    fn write_tuple(&mut self, ty: u8, name: &[u8], payload: &[u8]) -> Result<(), ChannelError> {
        let w = self.writer.as_mut().ok_or_else(|| ChannelError("SyncRpcChannel is closed".into()))?;
        let mut head = Vec::with_capacity(16 + name.len());
        head.push(FIXARRAY3);
        head.push(ty);
        write_bin_header(&mut head, name.len());
        head.extend_from_slice(name);
        write_bin_header(&mut head, payload.len());
        w.write_all(&head).map_err(io_err)?;
        w.write_all(payload).map_err(io_err)?;
        w.flush().map_err(io_err)
    }

    fn byte(&mut self) -> Result<u8, ChannelError> {
        let mut b = [0u8; 1];
        self.exact(&mut b)?;
        Ok(b[0])
    }

    fn exact(&mut self, buf: &mut [u8]) -> Result<(), ChannelError> {
        match self.reader.read_exact(buf) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => {
                let detail = match self.child.try_wait() {
                    Ok(Some(status)) => match status.code() {
                        Some(c) => format!("exited with code {c}"),
                        None => "killed by signal".to_string(),
                    },
                    _ => "unknown reason".to_string(),
                };
                Err(ChannelError(format!("Unexpected EOF while reading from child process ({detail})")))
            }
            Err(e) => Err(io_err(e)),
        }
    }

    fn read_bin(&mut self) -> Result<Vec<u8>, ChannelError> {
        let marker = self.byte()?;
        let size = match marker {
            BIN8 => self.byte()? as usize,
            BIN16 => {
                let mut h = [0u8; 2];
                self.exact(&mut h)?;
                u16::from_be_bytes(h) as usize
            }
            BIN32 => {
                let mut h = [0u8; 4];
                self.exact(&mut h)?;
                u32::from_be_bytes(h) as usize
            }
            m => return Err(ChannelError(format!("Expected binary data (0xc4-0xc6), received: 0x{m:x}"))),
        };
        let mut buf = vec![0u8; size];
        self.exact(&mut buf)?;
        Ok(buf)
    }

    fn read_tuple(&mut self) -> Result<(u8, Vec<u8>, Vec<u8>), ChannelError> {
        let marker = self.byte()?;
        if marker != FIXARRAY3 {
            return Err(ChannelError(format!("Expected fixed 3-element array (0x93), received: 0x{marker:x}")));
        }
        let tb = self.byte()?;
        let ty = if tb <= 0x7f {
            tb
        } else if tb == UINT8 {
            self.byte()?
        } else {
            return Err(ChannelError(format!("Expected positive fixint or uint8 marker, received: 0x{tb:x}")));
        };
        let name = self.read_bin()?;
        let payload = self.read_bin()?;
        Ok((ty, name, payload))
    }

    /// Send a request and wait for its response, serving callbacks inline.
    pub fn request(&mut self, method: &str, payload: &[u8]) -> Result<Vec<u8>, ChannelError> {
        self.write_tuple(MSG_REQUEST, method.as_bytes(), payload)?;
        loop {
            let (ty, name, payload) = self.read_tuple()?;
            match ty {
                MSG_RESPONSE => {
                    if name != method.as_bytes() {
                        return Err(ChannelError(format!(
                            "name mismatch for response: expected `{method}`, got `{}`",
                            String::from_utf8_lossy(&name)
                        )));
                    }
                    return Ok(payload);
                }
                MSG_ERROR => {
                    if name == method.as_bytes() {
                        return Err(ChannelError(String::from_utf8_lossy(&payload).into_owned()));
                    }
                    return Err(ChannelError(format!(
                        "name mismatch for response: expected `{method}`, got `{}`",
                        String::from_utf8_lossy(&name)
                    )));
                }
                MSG_CALL => self.handle_call(&name, &payload)?,
                other => return Err(ChannelError(format!("Invalid message type from child: {other}"))),
            }
        }
    }

    fn handle_call(&mut self, name: &[u8], payload: &[u8]) -> Result<(), ChannelError> {
        let name_s = String::from_utf8_lossy(name).into_owned();
        let arg = String::from_utf8_lossy(payload).into_owned();
        let result = match self.callbacks.get_mut(&name_s) {
            None => {
                let msg = format!("unknown callback: `{name_s}`. Please make sure to register it on the JavaScript side before invoking it.");
                self.write_tuple(MSG_CALL_ERROR, name, msg.as_bytes())?;
                return Err(ChannelError(format!("no callback named `{name_s}` found")));
            }
            Some(cb) => cb(&arg),
        };
        match result {
            Ok(out) => self.write_tuple(MSG_CALL_RESPONSE, name, out.as_bytes()),
            Err(msg) => {
                let msg = msg.trim().to_string();
                self.write_tuple(MSG_CALL_ERROR, name, msg.as_bytes())?;
                Err(ChannelError(format!("Error calling callback `{name_s}`: {msg}")))
            }
        }
    }

    /// Stop the child, then close the pipes: a child that sees its input
    /// close first reports the cancelled request on stderr.
    pub fn close(&mut self) {
        if self.writer.is_none() {
            return;
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
        self.writer = None;
    }
}

impl Drop for Channel {
    fn drop(&mut self) {
        self.close();
    }
}
