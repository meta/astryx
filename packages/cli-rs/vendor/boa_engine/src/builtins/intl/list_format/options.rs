use std::str::FromStr;

use icu_list::options::ListLength;

use crate::{
    Context, JsNativeError, JsResult, JsValue,
    builtins::options::{OptionType, ParsableOptionType},
};

#[derive(Debug, Clone, Copy, Default)]
pub(crate) enum ListFormatType {
    #[default]
    Conjunction,
    Disjunction,
    Unit,
}

#[derive(Debug)]
pub(crate) struct ParseListFormatTypeError;

impl std::fmt::Display for ParseListFormatTypeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("provided string was not `conjunction`, `disjunction` or `unit`")
    }
}

impl FromStr for ListFormatType {
    type Err = ParseListFormatTypeError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "conjunction" => Ok(Self::Conjunction),
            "disjunction" => Ok(Self::Disjunction),
            "unit" => Ok(Self::Unit),
            _ => Err(ParseListFormatTypeError),
        }
    }
}

impl ParsableOptionType for ListFormatType {}

impl OptionType for ListLength {
    fn from_value(value: JsValue, context: &mut Context) -> JsResult<Self> {
        match value.to_string(context)?.to_std_string_escaped().as_str() {
            "long" => Ok(Self::Wide),
            "short" => Ok(Self::Short),
            "narrow" => Ok(Self::Narrow),
            _ => Err(JsNativeError::range()
                .with_message("provided string was not `long`, `short` or `narrow`")
                .into()),
        }
    }
}
