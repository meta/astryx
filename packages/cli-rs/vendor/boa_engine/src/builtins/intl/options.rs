use std::{fmt, str::FromStr};

use icu_locale::{LanguageIdentifier, extensions::unicode};
use num_traits::FromPrimitive;

use crate::{
    Context, JsNativeError, JsResult, JsString, JsValue,
    builtins::{OrdinaryObject, intl::ServicePreferences, options::ParsableOptionType},
    context::icu::IntlProvider,
    object::JsObject,
};

/// `IntlOptions` aggregates the `locale_matcher` selector and any other object
/// property needed for `Intl` object constructors.
///
/// It is used as the type of the `options` parameter in the operation `resolve_locale`.
#[derive(Debug, Default)]
pub(super) struct IntlOptions<O> {
    pub(super) matcher: LocaleMatcher,
    pub(super) preferences: O,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub(super) enum LocaleMatcher {
    Lookup,
    #[default]
    BestFit,
}

#[derive(Debug)]
pub(super) struct ParseLocaleMatcherError;

impl fmt::Display for ParseLocaleMatcherError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        "provided string was not `lookup` or `best fit`".fmt(f)
    }
}

impl FromStr for LocaleMatcher {
    type Err = ParseLocaleMatcherError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "lookup" => Ok(Self::Lookup),
            "best fit" => Ok(Self::BestFit),
            _ => Err(ParseLocaleMatcherError),
        }
    }
}

impl ParsableOptionType for LocaleMatcher {}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub(super) struct EmptyPreferences;

impl From<&icu_locale::Locale> for EmptyPreferences {
    fn from(_: &icu_locale::Locale) -> Self {
        Self
    }
}

impl ServicePreferences for EmptyPreferences {
    fn validate(&mut self, _: &LanguageIdentifier, _: &IntlProvider) {}
    fn as_unicode(&self) -> unicode::Unicode {
        unicode::Unicode::new()
    }
    fn extended(&self, _: &Self) -> Self {
        Self
    }
    fn intersection(&self, _: &Self) -> Self {
        Self
    }
}

/// Abstract operation `GetNumberOption ( options, property, minimum, maximum, fallback )`
///
/// Extracts the value of the property named `property` from the provided `options`
/// object, converts it to a `Number value`, checks whether it is in the allowed range,
/// and fills in a `fallback` value if necessary.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma402/#sec-getnumberoption
pub(super) fn get_number_option<T>(
    options: &JsObject,
    property: JsString,
    minimum: T,
    maximum: T,
    context: &mut Context,
) -> JsResult<Option<T>>
where
    T: Into<f64> + FromPrimitive,
{
    // 1. Assert: Type(options) is Object.
    // 2. Let value be ? Get(options, property).
    let value = options.get(property, context)?;

    // 3. Return ? DefaultNumberOption(value, minimum, maximum, fallback).
    default_number_option(&value, minimum, maximum, context)
}

/// Abstract operation [`DefaultNumberOption ( value, minimum, maximum, fallback )`][spec]
///
/// Converts `value` to a `Number value`, checks whether it is in the allowed range,
/// and fills in a `fallback` value if necessary.
///
/// [spec]: https://tc39.es/ecma402/#sec-defaultnumberoption
pub(super) fn default_number_option<T>(
    value: &JsValue,
    minimum: T,
    maximum: T,
    context: &mut Context,
) -> JsResult<Option<T>>
where
    T: Into<f64> + FromPrimitive,
{
    // 1. If value is undefined, return fallback.
    if value.is_undefined() {
        return Ok(None);
    }

    // 2. Set value to ? ToNumber(value).
    let value = value.to_number(context)?;

    // 3. If value is NaN or less than minimum or greater than maximum, throw a RangeError exception.
    if value.is_nan() || value < minimum.into() || value > maximum.into() {
        return Err(JsNativeError::range()
            .with_message("DefaultNumberOption: value is out of range.")
            .into());
    }

    // 4. Return floor(value).
    // We already asserted the range of `value` with the conditional above.
    Ok(T::from_f64(value))
}

/// Abstract operation [`CoerceOptionsToObject ( options )`][spec]
///
/// Coerces `options` into a [`JsObject`] suitable for use with [`get_option`], defaulting to an
/// empty `JsObject`.
/// Because it coerces non-null primitive values into objects, its use is discouraged for new
/// functionality in favour of [`get_options_object`].
///
/// [spec]: https://tc39.es/ecma402/#sec-coerceoptionstoobject
/// [`get_option`]: crate::builtins::options::get_option
/// [`get_options_object`]: crate::builtins::options::get_options_object
pub(super) fn coerce_options_to_object(
    options: &JsValue,
    context: &mut Context,
) -> JsResult<JsObject> {
    // If options is undefined, then
    if options.is_undefined() {
        // a. Return OrdinaryObjectCreate(null).
        return Ok(JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            None,
            OrdinaryObject,
        )
        .upcast());
    }

    // 2. Return ? ToObject(options).
    options.to_object(context)
}
