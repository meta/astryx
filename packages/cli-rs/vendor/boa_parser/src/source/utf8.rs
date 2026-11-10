use super::ReadChar;
use std::io::{self, Bytes, Read};

/// Input for UTF-8 encoded sources.
#[derive(Debug)]
pub struct UTF8Input<R> {
    input: Bytes<R>,
}

impl<R: Read> UTF8Input<R> {
    /// Creates a new `UTF8Input` from a UTF-8 encoded source.
    pub(crate) fn new(iter: R) -> Self {
        Self {
            #[allow(clippy::unbuffered_bytes)]
            input: iter.bytes(),
        }
    }
}

impl<R: Read> UTF8Input<R> {
    /// Retrieves the next byte
    fn next_byte(&mut self) -> io::Result<Option<u8>> {
        self.input.next().transpose()
    }
}

impl<R: Read> ReadChar for UTF8Input<R> {
    /// Retrieves the next unchecked char in u32 code point.
    fn next_char(&mut self) -> io::Result<Option<u32>> {
        // Decode UTF-8
        let x = match self.next_byte()? {
            Some(b) if b >= 128 => b,         // UTF-8 codepoint
            b => return Ok(b.map(u32::from)), // ASCII or None
        };

        // Multibyte case follows
        // Decode from a byte combination out of: [[[x y] z] w]
        // NOTE: Performance is sensitive to the exact formulation here
        let init = utf8_first_byte(x, 2);
        let y = self.next_byte()?.unwrap_or(0);
        let mut ch = utf8_acc_cont_byte(init, y);
        if x >= 0xE0 {
            // [[x y z] w] case
            // 5th bit in 0xE0 .. 0xEF is always clear, so `init` is still valid
            let z = self.next_byte()?.unwrap_or(0);
            let y_z = utf8_acc_cont_byte(u32::from(y & CONT_MASK), z);
            ch = (init << 12) | y_z;
            if x >= 0xF0 {
                // [x y z w] case
                // use only the lower 3 bits of `init`
                let w = self.next_byte()?.unwrap_or(0);
                ch = ((init & 7) << 18) | utf8_acc_cont_byte(y_z, w);
            }
        }

        Ok(Some(ch))
    }
}

/// Mask of the value bits of a continuation byte.
const CONT_MASK: u8 = 0b0011_1111;

/// Returns the initial codepoint accumulator for the first byte.
/// The first byte is special, only want bottom 5 bits for width 2, 4 bits
/// for width 3, and 3 bits for width 4.
fn utf8_first_byte(byte: u8, width: u32) -> u32 {
    u32::from(byte & (0x7F >> width))
}

/// Returns the value of `ch` updated with continuation byte `byte`.
fn utf8_acc_cont_byte(ch: u32, byte: u8) -> u32 {
    (ch << 6) | u32::from(byte & CONT_MASK)
}
