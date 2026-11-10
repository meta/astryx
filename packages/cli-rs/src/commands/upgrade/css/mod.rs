//! Native PostCSS and postcss-selector-parser for the CSS codemods.

pub mod postcss;
pub mod selector;

use crate::commands::upgrade::jsc::CodemodError;

/// A PostCSS syntax error as `parse.mjs` marks it (a parse error of the
/// file's own source).
pub fn css_parse_error(e: postcss::CssError) -> CodemodError {
    let mut c = CodemodError::msg(e.message);
    c.parse = true;
    c.css = true;
    c.line = e.line;
    c.column = e.column;
    c
}

/// `processSelector(text, cb)`: parse, run `cb`, and print.
pub fn process_selector(text: &str, cb: &mut dyn FnMut(&mut selector::Sel) -> Result<(), String>) -> Result<String, ProcessError> {
    let mut s = selector::parse(text).map_err(ProcessError::Parse)?;
    cb(&mut s).map_err(ProcessError::Other)?;
    Ok(s.to_string(s.root))
}

#[derive(Debug)]
pub enum ProcessError {
    Parse(selector::SelError),
    Other(String),
}
