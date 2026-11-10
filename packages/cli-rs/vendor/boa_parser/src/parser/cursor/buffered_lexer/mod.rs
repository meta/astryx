use crate::{
    Error,
    lexer::{InputElement, Lexer, Token, TokenKind},
    parser::ParseResult,
    source::{ReadChar, UTF8Input},
};
use boa_ast::{LinearPosition, PositionGroup};
use boa_interner::Interner;

#[cfg(test)]
mod tests;

/// The maximum number of tokens which can be peeked ahead.
const MAX_PEEK_SKIP: usize = 3;

/// The fixed size of the buffer used for storing values that are peeked ahead.
///
/// The size is calculated for a worst case scenario, where we want to peek `MAX_PEEK_SKIP` tokens
/// skipping line terminators, and the stream ends just after:
/// ```text
/// [\n, B, \n, C, \n, D, \n, E, \n, F, None]
///   0  0   1  1   2  2   3  3   4  4  5
/// ```
const PEEK_BUF_SIZE: usize = (MAX_PEEK_SKIP + 1) * 2 + 1;

#[derive(Debug)]
pub(super) struct BufferedLexer<R> {
    lexer: Lexer<R>,
    peeked: [Option<Token>; PEEK_BUF_SIZE],
    read_index: usize,
    write_index: usize,
    last_linear_pos: LinearPosition,
}

impl<R> From<Lexer<R>> for BufferedLexer<R>
where
    R: ReadChar,
{
    fn from(lexer: Lexer<R>) -> Self {
        Self {
            lexer,
            peeked: [
                None::<Token>,
                None::<Token>,
                None::<Token>,
                None::<Token>,
                None::<Token>,
                None::<Token>,
                None::<Token>,
                None::<Token>,
                None::<Token>,
            ],
            read_index: 0,
            write_index: 0,
            last_linear_pos: LinearPosition::default(),
        }
    }
}

impl<R> From<R> for BufferedLexer<R>
where
    R: ReadChar,
{
    fn from(reader: R) -> Self {
        Lexer::new(reader).into()
    }
}

impl<'a> From<&'a [u8]> for BufferedLexer<UTF8Input<&'a [u8]>> {
    fn from(reader: &'a [u8]) -> Self {
        Lexer::from(reader).into()
    }
}

impl<R> BufferedLexer<R>
where
    R: ReadChar,
{
    /// Sets the goal symbol for the lexer.
    pub(super) fn set_goal(&mut self, elm: InputElement) {
        self.lexer.set_goal(elm);
    }

    /// Lexes the next tokens as a regex assuming that the starting '/' has already been consumed.
    /// If `init_with_eq` is `true`, then assuming that the starting '/=' has already been consumed.
    pub(super) fn lex_regex(
        &mut self,
        start: PositionGroup,
        interner: &mut Interner,
        init_with_eq: bool,
    ) -> ParseResult<Token> {
        self.set_goal(InputElement::RegExp);
        self.lexer
            .lex_slash_token(start, interner, init_with_eq)
            .map_err(Into::into)
    }

    /// Lexes the next tokens as template middle or template tail assuming that the starting
    /// '}' has already been consumed.
    pub(super) fn lex_template(
        &mut self,
        start: PositionGroup,
        interner: &mut Interner,
    ) -> ParseResult<Token> {
        self.lexer
            .lex_template(start, interner)
            .map_err(Error::from)
    }

    pub(super) const fn strict(&self) -> bool {
        self.lexer.strict()
    }

    pub(super) fn set_strict(&mut self, strict: bool) {
        self.lexer.set_strict(strict);
    }

    pub(super) const fn module(&self) -> bool {
        self.lexer.module()
    }

    pub(super) fn set_module(&mut self, module: bool) {
        self.lexer.set_module(module);
    }

    /// Fills the peeking buffer with the next token.
    ///
    /// It will not fill two line terminators one after the other.
    fn fill(&mut self, interner: &mut Interner) -> ParseResult<()> {
        debug_assert!(
            self.write_index < PEEK_BUF_SIZE,
            "write index went out of bounds"
        );

        let previous_index = self.write_index.checked_sub(1).unwrap_or(PEEK_BUF_SIZE - 1);

        if let Some(ref token) = self.peeked[previous_index]
            && token.kind() == &TokenKind::LineTerminator
        {
            // We don't want to have multiple contiguous line terminators in the buffer, since
            // they have no meaning.
            let next = loop {
                self.lexer.skip_html_close(interner)?;
                let next = self.lexer.next_no_skip(interner)?;
                if let Some(ref token) = next {
                    match token.kind() {
                        TokenKind::LineTerminator => { /* skip */ }
                        TokenKind::Comment => self.lexer.skip_html_close(interner)?,
                        _ => break next,
                    }
                } else {
                    break None;
                }
            };

            self.peeked[self.write_index] = next;
        } else {
            self.peeked[self.write_index] = self.lexer.next(interner)?;
        }

        self.write_index = (self.write_index + 1) % PEEK_BUF_SIZE;
        debug_assert_ne!(
            self.read_index, self.write_index,
            "we reached the read index with the write index"
        );
        debug_assert!(
            self.read_index < PEEK_BUF_SIZE,
            "read index went out of bounds"
        );

        Ok(())
    }

    /// Moves the cursor to the next token and returns the token.
    ///
    /// If `skip_line_terminators` is true then line terminators will be discarded.
    ///
    /// This follows iterator semantics in that a `peek(0, false)` followed by a `next(false)` will
    /// return the same value. Note that because a `peek(n, false)` may return a line terminator a
    /// subsequent `next(true)` may not return the same value.
    pub(super) fn next(
        &mut self,
        skip_line_terminators: bool,
        interner: &mut Interner,
    ) -> ParseResult<Option<Token>> {
        if self.read_index == self.write_index {
            self.fill(interner)?;
        }

        if let Some(ref token) = self.peeked[self.read_index] {
            if skip_line_terminators && token.kind() == &TokenKind::LineTerminator {
                // We only store 1 contiguous line terminator, so if the one at `self.read_index`
                // was a line terminator, we know that the next won't be one.
                self.read_index = (self.read_index + 1) % PEEK_BUF_SIZE;
                if self.read_index == self.write_index {
                    self.fill(interner)?;
                }
            }
            let tok = self.peeked[self.read_index].take();
            self.read_index = (self.read_index + 1) % PEEK_BUF_SIZE;

            if let Some(tok) = &tok {
                self.last_linear_pos = tok.linear_span().end();
            }

            Ok(tok)
        } else {
            // We do not update the read index, since we should always return `None` from now on.
            Ok(None)
        }
    }

    /// Peeks the `n`th token after the next token.
    ///
    /// **Note:** `n` must be in the range `[0, 3]`.
    /// i.e. if there are tokens `A`, `B`, `C`, `D`, `E` and `peek(0, false)` returns `A` then:
    ///  - `peek(1, false) == peek(1, true) == B`.
    ///  - `peek(2, false)` will return `C`.
    ///    where `A`, `B`, `C`, `D` and `E` are tokens but not line terminators.
    ///
    /// If `skip_line_terminators` is `true` then line terminators will be discarded.
    /// i.e. If there are tokens `A`, `\n`, `B` and `peek(0, false)` is `A` then the following
    /// will hold:
    ///  - `peek(0, true) == A`
    ///  - `peek(0, false) == A`
    ///  - `peek(1, true) == B`
    ///  - `peek(1, false) == \n`
    ///  - `peek(2, true) == None` (End of stream)
    ///  - `peek(2, false) == B`
    pub(super) fn peek(
        &mut self,
        skip_n: usize,
        skip_line_terminators: bool,
        interner: &mut Interner,
    ) -> ParseResult<Option<&Token>> {
        assert!(
            skip_n <= MAX_PEEK_SKIP,
            "you cannot skip more than {MAX_PEEK_SKIP} elements",
        );

        let mut read_index = self.read_index;
        let mut count = 0;
        let res_token = loop {
            if read_index == self.write_index {
                self.fill(interner)?;
            }

            if let Some(ref token) = self.peeked[read_index] {
                if skip_line_terminators && token.kind() == &TokenKind::LineTerminator {
                    read_index = (read_index + 1) % PEEK_BUF_SIZE;
                    // We only store 1 contiguous line terminator, so if the one at `self.read_index`
                    // was a line terminator, we know that the next won't be one.
                    if read_index == self.write_index {
                        self.fill(interner)?;
                    }
                }
                if count == skip_n {
                    break self.peeked[read_index].as_ref();
                }
            } else {
                break None;
            }
            read_index = (read_index + 1) % PEEK_BUF_SIZE;
            count += 1;
        };

        Ok(res_token)
    }

    /// Gets current linear position in the source code.
    #[inline]
    pub(super) fn linear_pos(&self) -> LinearPosition {
        self.last_linear_pos
    }

    pub(super) fn take_source(&mut self) -> boa_ast::SourceText {
        self.lexer.take_source()
    }
}
