use std::{
    fmt::Display,
    path::{Path, PathBuf},
    rc::Rc,
};

use boa_ast::Position;

mod builder;

use boa_gc::{Finalize, Trace};
use boa_string::JsString;
pub(crate) use builder::SourceMapBuilder;

use crate::SpannedSourceText;

#[cfg(test)]
mod tests;

/// Source information.
#[derive(Debug, Default, Clone, Finalize, Trace)]
// SAFETY: Nothing in Inner needs tracing, so this is safe.
#[boa_gc(unsafe_empty_trace)]
pub(crate) struct SourceInfo {
    inner: Rc<Inner>,
}

impl SourceInfo {
    pub(crate) fn new(
        source_map: SourceMap,
        function_name: JsString,
        source_text_spanned: SpannedSourceText,
    ) -> Self {
        Self {
            inner: Rc::new(Inner {
                map: source_map,
                function_name,
                text_spanned: source_text_spanned,
            }),
        }
    }

    pub(crate) fn map(&self) -> &SourceMap {
        &self.inner.map
    }

    pub(crate) fn function_name(&self) -> &JsString {
        &self.inner.function_name
    }

    pub(crate) fn text_spanned(&self) -> &SpannedSourceText {
        &self.inner.text_spanned
    }
}

#[derive(Debug, Default, Clone)]
struct Inner {
    map: SourceMap,
    function_name: JsString,

    text_spanned: SpannedSourceText,
}

/// Bytecode to source code mapping.
#[derive(Debug, Default, Clone)]
pub(crate) struct SourceMap {
    entries: Box<[Entry]>,
    path: SourcePath,
}

impl SourceMap {
    pub(crate) fn new(entries: Box<[Entry]>, path: SourcePath) -> Self {
        Self { entries, path }
    }

    pub(crate) fn entries(&self) -> &[Entry] {
        &self.entries
    }

    pub(crate) fn find(&self, pc: u32) -> Option<Position> {
        find_entry(self.entries(), pc)
    }

    pub(crate) fn path(&self) -> &SourcePath {
        &self.path
    }
}

fn find_entry(entries: &[Entry], pc: u32) -> Option<Position> {
    let first = entries.first()?;

    if pc < first.pc() {
        return None;
    }

    let mut low = 0;
    let mut high = entries.len() - 1;

    while low <= high {
        let mid = low.midpoint(high);
        let entry = &entries[mid];
        let start = entry.pc;

        let end = entries.get(mid + 1).map_or(u32::MAX, |entry| entry.pc);

        if pc < start {
            high = mid;
        } else if pc >= end {
            low = mid + 1;
        } else {
            return entry.position();
        }
    }

    // Since the last element defines the start of the end of the range,
    // therefore we return the last element's position.
    entries.last().and_then(Entry::position)
}

// TODO: The line number increments slower than column,
//       maybe we can take advantage of this, for memory optimization?
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Entry {
    /// Represents the start of a bytecode range that falls under the given position.
    ///
    /// The end of the range is the pc of the next entry.
    /// If the entry is the last, the end of the range is [`u32::MAX`].
    pub(crate) pc: u32,

    /// Source code [`Position`].
    pub(crate) position: Option<Position>,
}

impl Entry {
    pub(crate) const fn pc(&self) -> u32 {
        self.pc
    }

    pub(crate) const fn position(&self) -> Option<Position> {
        self.position
    }
}

/// The Path and type of [`boa_engine::Source`]. This applies to functions and objects.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub enum SourcePath {
    /// There was no source associated with this call.
    #[default]
    None,
    /// The source is from an `eval()` call.
    // TODO: Could add more information, like path in which the eval is located.
    Eval,
    /// The source is from a `JSON.parse()` call.
    // TODO: Could add more information, like path in which the JSON.parse is located.
    Json,
    /// The source is from a file or module. This contains the [`Path`] of the
    /// module (e.g. the absolute file path).
    Path(Rc<Path>),
}

impl From<Option<PathBuf>> for SourcePath {
    fn from(value: Option<PathBuf>) -> Self {
        match value {
            None => Self::None,
            Some(path) => Self::Path(path.into()),
        }
    }
}

impl From<Option<Rc<Path>>> for SourcePath {
    fn from(value: Option<Rc<Path>>) -> Self {
        match value {
            None => Self::None,
            Some(path) => Self::Path(path),
        }
    }
}

impl Display for SourcePath {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SourcePath::None => f.write_str("unknown at "),
            SourcePath::Eval => f.write_str("eval at "),
            SourcePath::Json => f.write_str("json at "),
            SourcePath::Path(path) => write!(f, "{}", path.display()),
        }
    }
}

/// A struct containing information about native source code.
///
/// # Note
///
/// If the `native-backtrace` feature is not enabled the this becomes [zero sized type][zst].
///
/// [zst]: https://doc.rust-lang.org/nomicon/exotic-sizes.html#zero-sized-types-zsts
#[derive(Debug, Clone, Copy)]
pub struct NativeSourceInfo {
    #[cfg(feature = "native-backtrace")]
    inner: &'static std::panic::Location<'static>,

    #[cfg(not(feature = "native-backtrace"))]
    inner: std::marker::PhantomData<()>,
}

impl NativeSourceInfo {
    /// Returns the source location of the caller of this function.
    ///
    /// If that function’s caller is annotated with `#[track_caller]`, then its call
    /// location will be returned, and so on up the stack to the first call within
    /// a non-tracked function body.
    #[inline]
    #[must_use]
    #[cfg_attr(feature = "native-backtrace", track_caller)]
    pub const fn caller() -> Self {
        Self {
            #[cfg(feature = "native-backtrace")]
            inner: std::panic::Location::caller(),

            #[cfg(not(feature = "native-backtrace"))]
            inner: std::marker::PhantomData,
        }
    }

    /// Return a [`std::panic::Location`].
    ///
    /// # Note
    ///
    /// If the `native-backtrace` feature is not enabled, then this always returns [`None`].
    #[inline]
    #[must_use]
    pub const fn as_location(self) -> Option<&'static std::panic::Location<'static>> {
        #[cfg(feature = "native-backtrace")]
        return Some(self.inner);

        #[cfg(not(feature = "native-backtrace"))]
        return None;
    }
}
