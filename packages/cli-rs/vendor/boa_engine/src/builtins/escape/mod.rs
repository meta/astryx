//! Boa's implementation of ECMAScript's string escaping functions.
//!
//! The `escape()` function replaces all characters with escape sequences, with the exception of ASCII
//! word characters (A–Z, a–z, 0–9, _) and @*_+-./.
//!
//! The `unescape()` function replaces any escape sequence with the character that it represents.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-additional-properties-of-the-global-object

use crate::{
    Context, JsArgs, JsObject, JsResult, JsString, JsValue, context::intrinsics::Intrinsics,
    js_string, realm::Realm, string::StaticJsStrings,
};

use super::{BuiltInBuilder, BuiltInObject, IntrinsicObject};

/// The `escape` function
#[derive(Debug, Clone, Copy)]
pub(crate) struct Escape;

impl IntrinsicObject for Escape {
    fn init(realm: &Realm) {
        BuiltInBuilder::callable_with_intrinsic::<Self>(realm, escape)
            .name(Self::NAME)
            .length(1)
            .build();
    }
    fn get(intrinsics: &Intrinsics) -> JsObject {
        intrinsics.objects().escape().into()
    }
}

impl BuiltInObject for Escape {
    const NAME: JsString = StaticJsStrings::ESCAPE;
}

/// Builtin JavaScript `escape ( string )` function.
fn escape(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
    /// Returns `true` if the codepoint `cp` is part of the `unescapedSet`.
    fn is_unescaped(cp: u16) -> bool {
        let Ok(cp) = TryInto::<u8>::try_into(cp) else {
            return false;
        };

        // 4. Let unescapedSet be the string-concatenation of the ASCII word characters and "@*+-./".
        cp.is_ascii_alphanumeric() || b"_@*+-./".contains(&cp)
    }

    // 1. Set string to ? ToString(string).
    let string = args.get_or_undefined(0).to_string(context)?;

    // 3. Let R be the empty String.
    let mut vec = Vec::with_capacity(string.len());

    // 2. Let len be the length of string.
    // 5. Let k be 0.
    // 6. Repeat, while k < len,
    //     a. Let C be the code unit at index k within string.
    for cp in &string {
        // b. If unescapedSet contains C, then
        if is_unescaped(cp) {
            // i. Let S be C.
            vec.push(cp);
            continue;
        }
        // c. Else,
        //     i. Let n be the numeric value of C.
        //     ii. If n < 256, then
        let c = if cp < 256 {
            //     1. Let hex be the String representation of n, formatted as an uppercase hexadecimal number.
            //     2. Let S be the string-concatenation of "%" and ! StringPad(hex, 2𝔽, "0", start).
            format!("%{cp:02X}")
        }
        //     iii. Else,
        else {
            //     1. Let hex be the String representation of n, formatted as an uppercase hexadecimal number.
            //     2. Let S be the string-concatenation of "%u" and ! StringPad(hex, 4𝔽, "0", start).
            format!("%u{cp:04X}")
        };
        // d. Set R to the string-concatenation of R and S.
        // e. Set k to k + 1.
        vec.extend(c.encode_utf16());
    }

    // 7. Return R.
    Ok(js_string!(&vec[..]).into())
}

/// The `unescape` function
#[derive(Debug, Clone, Copy)]
pub(crate) struct Unescape;

impl IntrinsicObject for Unescape {
    fn init(realm: &Realm) {
        BuiltInBuilder::callable_with_intrinsic::<Self>(realm, unescape)
            .name(Self::NAME)
            .length(1)
            .build();
    }
    fn get(intrinsics: &Intrinsics) -> JsObject {
        intrinsics.objects().unescape().into()
    }
}

impl BuiltInObject for Unescape {
    const NAME: JsString = StaticJsStrings::UNESCAPE;
}

/// Builtin JavaScript `unescape ( string )` function.
fn unescape(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
    /// Converts a char `cp` to its corresponding hex digit value.
    fn to_hex_digit(cp: u16) -> Option<u16> {
        char::from_u32(u32::from(cp))
            .and_then(|c| c.to_digit(16))
            .and_then(|d| d.try_into().ok())
    }

    // 1. Set string to ? ToString(string).
    let string = args.get_or_undefined(0).to_string(context)?;

    // 3. Let R be the empty String.
    let mut vec = Vec::with_capacity(string.len());

    let mut codepoints = <PeekableN<_, 6>>::new(string.iter());

    // 2. Let len be the length of string.
    // 4. Let k be 0.
    // 5. Repeat, while k < len,
    // a. Let C be the code unit at index k within string.
    while let Some(cp) = codepoints.next() {
        // b. If C is the code unit 0x0025 (PERCENT SIGN), then
        if cp != u16::from(b'%') {
            vec.push(cp);
            continue;
        }

        //     i. Let hexDigits be the empty String.
        //     ii. Let optionalAdvance be 0.
        // TODO: Try blocks :(
        let Some(unescaped_cp) = (|| match *codepoints.peek_n(5) {
            // iii. If k + 5 < len and the code unit at index k + 1 within string is the code unit
            // 0x0075 (LATIN SMALL LETTER U), then
            [u, n1, n2, n3, n4] if u == u16::from(b'u') => {
                // 1. Set hexDigits to the substring of string from k + 2 to k + 6.
                // 2. Set optionalAdvance to 5.
                let n1 = to_hex_digit(n1)?;
                let n2 = to_hex_digit(n2)?;
                let n3 = to_hex_digit(n3)?;
                let n4 = to_hex_digit(n4)?;

                // TODO: https://github.com/rust-lang/rust/issues/77404
                for _ in 0..5 {
                    codepoints.next();
                }

                Some((n1 << 12) + (n2 << 8) + (n3 << 4) + n4)
            }
            // iv. Else if k + 3 ≤ len, then
            [n1, n2, ..] => {
                // 1. Set hexDigits to the substring of string from k + 1 to k + 3.
                // 2. Set optionalAdvance to 2.
                let n1 = to_hex_digit(n1)?;
                let n2 = to_hex_digit(n2)?;

                // TODO: https://github.com/rust-lang/rust/issues/77404
                for _ in 0..2 {
                    codepoints.next();
                }

                Some((n1 << 4) + n2)
            }
            _ => None,
        })() else {
            vec.push(u16::from(b'%'));
            continue;
        };

        //     v. Let parseResult be ParseText(StringToCodePoints(hexDigits), HexDigits[~Sep]).
        //     vi. If parseResult is a Parse Node, then
        //         1. Let n be the MV of parseResult.
        //         2. Set C to the code unit whose numeric value is n.
        //         3. Set k to k + optionalAdvance.
        // c. Set R to the string-concatenation of R and C.
        // d. Set k to k + 1.
        vec.push(unescaped_cp);
    }
    // 6. Return R.
    Ok(js_string!(&vec[..]).into())
}

/// An iterator that can peek `N` items.
struct PeekableN<I, const N: usize>
where
    I: Iterator,
{
    iterator: I,
    buffer: [I::Item; N],
    buffered_end: usize,
}

impl<I, const N: usize> PeekableN<I, N>
where
    I: Iterator,
    I::Item: Default + Copy,
{
    /// Creates a new `PeekableN`.
    fn new(iterator: I) -> Self {
        Self {
            iterator,
            buffer: [I::Item::default(); N],
            buffered_end: 0,
        }
    }

    /// Peeks `n` items from the iterator.
    fn peek_n(&mut self, count: usize) -> &[I::Item] {
        if count <= self.buffered_end {
            return &self.buffer[..count];
        }
        for _ in 0..(count - self.buffered_end) {
            let Some(next) = self.iterator.next() else {
                return &self.buffer[..self.buffered_end];
            };
            self.buffer[self.buffered_end] = next;
            self.buffered_end += 1;
        }

        &self.buffer[..count]
    }
}

impl<I, const N: usize> Iterator for PeekableN<I, N>
where
    I: Iterator,
    I::Item: Copy,
{
    type Item = I::Item;

    fn next(&mut self) -> Option<Self::Item> {
        if self.buffered_end > 0 {
            let item = self.buffer[0];
            self.buffer.rotate_left(1);
            self.buffered_end -= 1;
            return Some(item);
        }
        self.iterator.next()
    }
}
