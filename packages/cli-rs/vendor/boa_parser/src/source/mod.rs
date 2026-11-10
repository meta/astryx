//! Boa parser input source types.

use std::{
    fs::File,
    io::{self, BufReader, Read},
    path::Path,
};

pub use utf8::UTF8Input;
pub use utf16::UTF16Input;

mod utf16;
mod utf8;

/// A source of ECMAScript code.
///
/// [`Source`]s can be created from plain [`str`]s, file [`Path`]s or more generally, any [`Read`]
/// instance.
#[derive(Debug)]
pub struct Source<'path, R> {
    pub(crate) reader: R,
    pub(crate) path: Option<&'path Path>,
}

impl<'bytes> Source<'static, UTF8Input<&'bytes [u8]>> {
    /// Creates a new `Source` from any type equivalent to a slice of bytes e.g. [`&str`][str],
    /// <code>[Vec]<[u8]></code>, <code>[Box]<[\[u8\]][slice]></code> or a plain slice
    /// <code>[&\[u8\]][slice]</code>.
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_parser::Source;
    /// let code = r#"var array = [5, 4, 3, 2, 1];"#;
    /// let source = Source::from_bytes(code);
    /// ```
    ///
    /// [slice]: std::slice
    pub fn from_bytes<T: AsRef<[u8]> + ?Sized>(source: &'bytes T) -> Self {
        Self {
            reader: UTF8Input::new(source.as_ref()),
            path: None,
        }
    }
}

impl<'input> Source<'static, UTF16Input<'input>> {
    /// Creates a new `Source` from a UTF-16 encoded slice e.g. <code>[&\[u16\]][slice]</code>.
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_parser::Source;
    /// let utf16: Vec<u16> =
    ///     "var array = [5, 4, 3, 2, 1];".encode_utf16().collect();
    /// let source = Source::from_utf16(&utf16);
    /// ```
    ///
    /// [slice]: std::slice
    #[must_use]
    pub fn from_utf16(input: &'input [u16]) -> Self {
        Self {
            reader: UTF16Input::new(input),
            path: None,
        }
    }
}

impl<'path> Source<'path, UTF8Input<BufReader<File>>> {
    /// Creates a new `Source` from a `Path` to a file.
    ///
    /// # Errors
    ///
    /// See [`File::open`].
    ///
    /// # Examples
    ///
    /// ```no_run
    /// # use boa_parser::Source;
    /// # use std::{fs::File, path::Path};
    /// # fn main() -> std::io::Result<()> {
    /// let path = Path::new("script.js");
    /// let source = Source::from_filepath(path)?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn from_filepath(source: &'path Path) -> io::Result<Self> {
        let reader = File::open(source)?;
        Ok(Self {
            reader: UTF8Input::new(BufReader::new(reader)),
            path: Some(source),
        })
    }
}

impl<'path, R: Read> Source<'path, UTF8Input<R>> {
    /// Creates a new `Source` from a [`Read`] instance and an optional [`Path`].
    ///
    /// # Examples
    ///
    /// ```no_run
    /// # use boa_parser::Source;
    /// # use std::{fs::File, io::Read, path::Path};
    /// # fn main() -> std::io::Result<()> {
    /// let strictler = r#""use strict""#;
    ///
    /// let path = Path::new("no_strict.js");
    /// let file = File::open(path)?;
    /// let strict = strictler.as_bytes().chain(file);
    ///
    /// let source = Source::from_reader(strict, Some(path));
    /// #    Ok(())
    /// # }
    /// ```
    pub fn from_reader(reader: R, path: Option<&'path Path>) -> Self {
        Self {
            reader: UTF8Input::new(reader),
            path,
        }
    }
}

impl<'path, R> Source<'path, R> {
    /// Sets the path of this [`Source`].
    pub fn with_path(self, new_path: &Path) -> Source<'_, R> {
        Source {
            reader: self.reader,
            path: Some(new_path),
        }
    }

    /// Returns the path (if any) of this source file.
    pub fn path(&self) -> Option<&'path Path> {
        self.path
    }
}

/// This trait is used to abstract over the different types of input readers.
pub trait ReadChar {
    /// Retrieves the next unicode code point. Returns `None` if the end of the input is reached.
    ///
    /// # Errors
    ///
    /// Returns an error if the next input in the input is not a valid unicode code point.
    fn next_char(&mut self) -> io::Result<Option<u32>>;
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use super::*;

    #[test]
    fn from_bytes() {
        let mut source = Source::from_bytes("'Hello' + 'World';");

        assert!(source.path.is_none());

        let mut content = String::new();
        while let Some(c) = source.reader.next_char().unwrap() {
            content.push(char::from_u32(c).unwrap());
        }

        assert_eq!(content, "'Hello' + 'World';");
    }

    #[test]
    fn from_filepath() {
        let manifest_path = Path::new(env!("CARGO_MANIFEST_DIR"));
        let filepath = manifest_path.join("src/parser/tests/test.js");
        let mut source = Source::from_filepath(&filepath).unwrap();

        assert_eq!(source.path, Some(&*filepath));

        let mut content = String::new();
        while let Some(c) = source.reader.next_char().unwrap() {
            content.push(char::from_u32(c).unwrap());
        }

        assert_eq!(content, "\"Hello\" + \"World\";\n");
    }

    #[test]
    fn from_reader() {
        // Without path
        let mut source = Source::from_reader(Cursor::new("'Hello' + 'World';"), None);

        assert!(source.path.is_none());

        let mut content = String::new();
        while let Some(c) = source.reader.next_char().unwrap() {
            content.push(char::from_u32(c).unwrap());
        }

        assert_eq!(content, "'Hello' + 'World';");

        // With path
        let mut source =
            Source::from_reader(Cursor::new("'Hello' + 'World';"), Some("test.js".as_ref()));

        assert_eq!(source.path, Some("test.js".as_ref()));

        let mut content = String::new();
        while let Some(c) = source.reader.next_char().unwrap() {
            content.push(char::from_u32(c).unwrap());
        }

        assert_eq!(content, "'Hello' + 'World';");
    }
}
