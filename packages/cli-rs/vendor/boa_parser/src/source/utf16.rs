use super::ReadChar;
use std::io;

/// Input for UTF-16 encoded sources.
#[derive(Debug)]
pub struct UTF16Input<'a> {
    input: &'a [u16],
    index: usize,
}

impl<'a> UTF16Input<'a> {
    /// Creates a new `UTF16Input` from a UTF-16 encoded slice e.g. <code>[&\[u16\]][slice]</code>.
    ///
    /// [slice]: std::slice
    #[must_use]
    pub const fn new(input: &'a [u16]) -> Self {
        Self { input, index: 0 }
    }

    // use `#[cold]` to hint to branch predictor that surrogate pairs are rare
    #[cold]
    fn handle_surrogate_pair(&mut self, u1: u16) -> u32 {
        let Some(u2) = self.input.get(self.index).copied() else {
            return u1.into();
        };

        // If the code unit is not a low surrogate, it is not a surrogate pair.
        if !is_low_surrogate(u2) {
            return u1.into();
        }

        self.index += 1;

        code_point_from_surrogates(u1, u2)
    }
}

impl ReadChar for UTF16Input<'_> {
    /// Retrieves the next unchecked char in u32 code point.
    fn next_char(&mut self) -> io::Result<Option<u32>> {
        let Some(u1) = self.input.get(self.index).copied() else {
            return Ok(None);
        };

        self.index += 1;

        // If the code unit is not a high surrogate, it is not the start of a surrogate pair.
        if !is_high_surrogate(u1) {
            return Ok(Some(u1.into()));
        }

        Ok(Some(self.handle_surrogate_pair(u1)))
    }
}

const SURROGATE_HIGH_START: u16 = 0xD800;
const SURROGATE_HIGH_END: u16 = 0xDBFF;
const SURROGATE_LOW_START: u16 = 0xDC00;
const SURROGATE_LOW_END: u16 = 0xDFFF;

fn is_high_surrogate(b: u16) -> bool {
    (SURROGATE_HIGH_START..=SURROGATE_HIGH_END).contains(&b)
}

fn is_low_surrogate(b: u16) -> bool {
    (SURROGATE_LOW_START..=SURROGATE_LOW_END).contains(&b)
}

fn code_point_from_surrogates(high: u16, low: u16) -> u32 {
    (((u32::from(high & 0x3ff)) << 10) | u32::from(low & 0x3ff)) + 0x1_0000
}
