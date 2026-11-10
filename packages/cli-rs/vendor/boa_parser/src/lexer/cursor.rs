//! Boa's lexer cursor that manages the input byte stream.

use crate::source::{ReadChar, UTF8Input};
use boa_ast::{LinearPosition, Position, PositionGroup, SourceText};
use std::io::{self, Error, ErrorKind};

/// Cursor over the source code.
#[derive(Debug)]
pub(super) struct Cursor<R> {
    iter: R,
    pos: Position,
    module: bool,
    strict: bool,
    peeked: [Option<u32>; 4],
    source_collector: SourceText,
}

impl<R> Cursor<R> {
    /// Gets the current position of the cursor in the source code.
    #[inline]
    pub(super) fn pos_group(&self) -> PositionGroup {
        PositionGroup::new(self.pos, self.linear_pos())
    }

    /// Gets the current position of the cursor in the source code.
    #[inline]
    pub(super) const fn pos(&self) -> Position {
        self.pos
    }

    /// Gets the current linear position of the cursor in the source code.
    #[inline]
    pub(super) fn linear_pos(&self) -> LinearPosition {
        self.source_collector.cur_linear_position()
    }

    pub(super) fn take_source(&mut self) -> SourceText {
        let replace_with = SourceText::with_capacity(0);
        std::mem::replace(&mut self.source_collector, replace_with)
    }

    /// Advances the position to the next column.
    fn next_column(&mut self) {
        let current_line = self.pos.line_number();
        let next_column = self.pos.column_number() + 1;
        self.pos = Position::new(current_line, next_column);
    }

    /// Advances the position to the next line.
    fn next_line(&mut self) {
        let next_line = self.pos.line_number() + 1;
        self.pos = Position::new(next_line, 1);
    }

    /// Returns if strict mode is currently active.
    pub(super) const fn strict(&self) -> bool {
        self.strict
    }

    /// Sets the current strict mode.
    pub(super) fn set_strict(&mut self, strict: bool) {
        self.strict = strict;
    }

    /// Returns if the module mode is currently active.
    pub(super) const fn module(&self) -> bool {
        self.module
    }

    /// Sets the current goal symbol to module.
    pub(super) fn set_module(&mut self, module: bool) {
        self.module = module;
        self.strict = module;
    }
}

impl<R: ReadChar> Cursor<R> {
    /// Creates a new Lexer cursor.
    pub(super) fn new(inner: R) -> Self {
        Self {
            iter: inner,
            pos: Position::new(1, 1),
            strict: false,
            module: false,
            peeked: [None; 4],
            source_collector: SourceText::default(),
        }
    }

    /// Peeks the next n bytes, the maximum number of peeked bytes is 4 (n <= 4).
    pub(super) fn peek_n(&mut self, n: u8) -> Result<&[Option<u32>; 4], Error> {
        let peeked = self.peeked.iter().filter(|c| c.is_some()).count();
        let needs_peek = n as usize - peeked;

        for i in 0..needs_peek {
            let next = self.iter.next_char()?;
            self.peeked[i + peeked] = next;
        }

        Ok(&self.peeked)
    }

    /// Peeks the next UTF-8 character in u32 code point.
    pub(super) fn peek_char(&mut self) -> Result<Option<u32>, Error> {
        if let Some(c) = self.peeked[0] {
            return Ok(Some(c));
        }

        let next = self.iter.next_char()?;
        self.peeked[0] = next;
        Ok(next)
    }

    pub(super) fn next_if(&mut self, c: u32) -> io::Result<bool> {
        if self.peek_char()? == Some(c) {
            self.next_char()?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Applies the predicate to the next character and returns the result.
    /// Returns false if the next character is not a valid ascii or there is no next character.
    /// Otherwise returns the result from the predicate on the ascii in char
    ///
    /// The buffer is not incremented.
    pub(super) fn next_is_ascii_pred<F>(&mut self, pred: &F) -> io::Result<bool>
    where
        F: Fn(char) -> bool,
    {
        Ok(match self.peek_char()? {
            Some(byte) if (0..=0x7F).contains(&byte) =>
            {
                #[allow(clippy::cast_possible_truncation)]
                pred(char::from(byte as u8))
            }
            Some(_) | None => false,
        })
    }

    /// Fills the buffer with all bytes until the stop byte is found.
    /// Returns error when reaching the end of the buffer.
    ///
    /// Note that all bytes up until the stop byte are added to the buffer, including the byte right before.
    pub(super) fn take_until(&mut self, stop: u32, buf: &mut Vec<u32>) -> io::Result<()> {
        loop {
            if self.next_if(stop)? {
                return Ok(());
            } else if let Some(c) = self.next_char()? {
                buf.push(c);
            } else {
                return Err(Error::new(
                    ErrorKind::UnexpectedEof,
                    format!("Unexpected end of file when looking for character {stop}"),
                ));
            }
        }
    }

    /// Fills a mutable slice up to the ends while characters are alphabetic. Returns
    /// the number of characters read, or `N+1` if the buffer was filled but there were
    /// still characters after.
    pub(super) fn take_array_alphabetic<const N: usize>(
        &mut self,
        arr: &mut [u32; N],
    ) -> io::Result<usize> {
        for (i, out) in arr.iter_mut().enumerate() {
            match self.peek_char()? {
                // A..Z | a..z
                Some(0x41..=0x5A | 0x61..=0x7A) => {
                    *out = self.next_char()?.expect("Already checked.");
                }
                _ => return Ok(i),
            }
        }
        // Check the next character and return N+1 if it's alphabetic.
        match self.peek_char() {
            // A..Z | a..z
            Ok(Some(0x41..=0x5A | 0x61..=0x7A)) => Ok(N + 1),
            _ => Ok(N),
        }
    }

    /// Retrieves the next UTF-8 character.
    pub(crate) fn next_char(&mut self) -> Result<Option<u32>, Error> {
        let ch = if let Some(c) = self.peeked[0] {
            self.peeked[0] = None;
            self.peeked.rotate_left(1);
            Some(c)
        } else {
            self.iter.next_char()?
        };

        if let Some(ch) = ch {
            self.source_collector.collect_code_point(ch);
        }

        match ch {
            Some(0xD) => {
                // Try to take a newline if it's next, for windows "\r\n" newlines
                // Otherwise, treat as a Mac OS9 bare '\r' newline
                if self.peek_char()? == Some(0xA) {
                    self.peeked[0] = None;
                    self.peeked.rotate_left(1);
                    self.source_collector.collect_code_point(0xA);
                }
                self.next_line();
            }
            // '\n' | '\u{2028}' | '\u{2029}'
            Some(0xA | 0x2028 | 0x2029) => self.next_line(),
            Some(_) => self.next_column(),
            _ => {}
        }

        Ok(ch)
    }
}

impl<'a> From<&'a [u8]> for Cursor<UTF8Input<&'a [u8]>> {
    fn from(input: &'a [u8]) -> Self {
        Self::new(UTF8Input::new(input))
    }
}
