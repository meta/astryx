use std::fmt::{self, Display};

use boa_gc::{Finalize, Trace};
use boa_string::JsString;
use thin_vec::ThinVec;

use super::source_info::{NativeSourceInfo, SourceInfo};

#[derive(Debug, Default, Clone, Trace, Finalize)]
pub(crate) struct Backtrace {
    // SAFETY: Nothing in `ShadowEntry` requires trace, so this is safe.
    #[unsafe_ignore_trace]
    stack: ThinVec<ShadowEntry>,
}

impl Backtrace {
    pub(crate) fn iter(&self) -> impl DoubleEndedIterator<Item = &ShadowEntry> {
        self.stack.iter()
    }
}

#[derive(Debug, Clone, Trace, Finalize)]
pub(crate) enum ErrorStack {
    Position(#[unsafe_ignore_trace] ShadowEntry),
    Backtrace(#[unsafe_ignore_trace] Backtrace),
}

impl ErrorStack {
    pub(crate) fn backtrace(&self) -> Option<&Backtrace> {
        match self {
            Self::Backtrace(bt) => Some(bt),
            Self::Position(_) => None,
        }
    }

    pub(crate) fn position(&self) -> Option<&ShadowEntry> {
        match self {
            Self::Position(position) => Some(position),
            Self::Backtrace(bt) => bt.iter().next(),
        }
    }

    pub(crate) fn is_backtrace(&self) -> bool {
        matches!(self, Self::Backtrace(_))
    }
}

#[derive(Debug, Clone)]
pub(crate) enum ShadowEntry {
    Native {
        function_name: Option<JsString>,
        source_info: NativeSourceInfo,
    },
    Bytecode {
        pc: u32,
        source_info: SourceInfo,
    },
}

impl ShadowEntry {
    /// Create a display wrapper for this entry.
    ///
    /// # Arguments
    ///
    /// * `show_function_name` - Whether to include the function name in the output.
    pub(crate) fn display(&self, show_function_name: bool) -> DisplayShadowEntry<'_> {
        DisplayShadowEntry {
            entry: self,
            show_function_name,
        }
    }
}

/// Helper struct to format a shadow entry for display.
pub(crate) struct DisplayShadowEntry<'a> {
    entry: &'a ShadowEntry,
    show_function_name: bool,
}

impl Display for DisplayShadowEntry<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.entry {
            ShadowEntry::Native {
                function_name,
                source_info,
            } => {
                if self.show_function_name {
                    if let Some(function_name) = function_name {
                        write!(f, "{}", function_name.to_std_string_escaped())?;
                    } else {
                        f.write_str("<anonymous>")?;
                    }
                }

                if let Some(loc) = source_info.as_location() {
                    write!(
                        f,
                        " (native at {}:{}:{})",
                        loc.file(),
                        loc.line(),
                        loc.column()
                    )?;
                } else {
                    f.write_str(" (native)")?;
                }
            }
            ShadowEntry::Bytecode { pc, source_info } => {
                if self.show_function_name {
                    let has_function_name = !source_info.function_name().is_empty();
                    if has_function_name {
                        write!(f, "{}", source_info.function_name().to_std_string_escaped())?;
                    } else {
                        f.write_str("<main>")?;
                    }
                }
                f.write_str(" (")?;

                source_info.map().path().fmt(f)?;

                if let Some(position) = source_info.map().find(*pc) {
                    write!(
                        f,
                        ":{}:{}",
                        position.line_number(),
                        position.column_number()
                    )?;
                } else {
                    f.write_str(":?:?")?;
                }
                f.write_str(")")?;
            }
        }
        Ok(())
    }
}

#[derive(Debug, Default, Clone)]
pub(crate) struct ShadowStack {
    stack: ThinVec<ShadowEntry>,
}

impl ShadowStack {
    pub(crate) fn push_native(
        &mut self,
        last_pc: u32,
        function_name: JsString,
        native_source_info: NativeSourceInfo,
    ) {
        // NOTE: pc points to the next opcode, so we offset by -1 to put it within range.
        let last_pc = last_pc.saturating_sub(1);

        match self.stack.last_mut() {
            Some(ShadowEntry::Bytecode { pc, .. }) => *pc = last_pc,
            Some(ShadowEntry::Native { source_info, .. }) => *source_info = native_source_info,
            _ => {}
        }
        self.stack.push(ShadowEntry::Native {
            function_name: Some(function_name),
            source_info: native_source_info,
        });
    }

    pub(crate) fn push_bytecode(&mut self, last_pc: u32, source_info: SourceInfo) {
        // NOTE: pc points to the next opcode, so we offset by -1 to put it within range.
        let last_pc = last_pc.saturating_sub(1);

        if let Some(ShadowEntry::Bytecode { pc, .. }) = self.stack.last_mut() {
            *pc = last_pc;
        }
        self.stack
            .push(ShadowEntry::Bytecode { pc: 0, source_info });
    }

    pub(crate) fn pop(&mut self) -> Option<ShadowEntry> {
        self.stack.pop()
    }

    pub(crate) fn take(&self, n: usize, last_pc: u32) -> Backtrace {
        let mut stack = self
            .stack
            .iter()
            .rev()
            .take(n)
            .rev()
            .cloned()
            .collect::<ThinVec<_>>();

        if let Some(ShadowEntry::Bytecode { pc, .. }) = stack.last_mut() {
            // NOTE: pc points to the next opcode, so we offset by -1 to put it within range.
            *pc = last_pc.saturating_sub(1);
        }
        Backtrace { stack }
    }

    pub(crate) fn take_and_push(&self, n: usize, last_pc: u32, value: ShadowEntry) -> Backtrace {
        let mut stack = self
            .stack
            .iter()
            .rev()
            .take(n)
            .rev()
            .cloned()
            .chain(std::iter::once(value))
            .collect::<ThinVec<_>>();

        let last = stack.len() - 2;
        if let Some(ShadowEntry::Bytecode { pc, .. }) = stack.get_mut(last) {
            // NOTE: pc points to the next opcode, so we offset by -1 to put it within range.
            *pc = last_pc.saturating_sub(1);
        }
        Backtrace { stack }
    }

    pub(crate) fn caller_position(&self, n: usize) -> Backtrace {
        // NOTE: We push the function that is currently executing, so skip the last one.
        let stack = self
            .stack
            .iter()
            .rev()
            .skip(1)
            .take(n)
            .rev()
            .cloned()
            .collect::<ThinVec<_>>();

        Backtrace { stack }
    }

    #[cfg(feature = "native-backtrace")]
    pub(crate) fn patch_last_native(&mut self, new_source_info: NativeSourceInfo) {
        let Some(ShadowEntry::Native { source_info, .. }) = self.stack.last_mut() else {
            return;
        };
        *source_info = new_source_info;
    }
}
