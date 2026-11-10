//! Temporal Option types.

// Implementation Note:
//
// The below Option types are adapted from the types laid out by
// the Temporal proposal's polyfill types that can be found at the
// below link.
//
// https://github.com/tc39/proposal-temporal/blob/main/polyfill/index.d.ts

use crate::{
    Context, JsNativeError, JsObject, JsResult, JsString, JsValue,
    builtins::options::{OptionType, ParsableOptionType, get_option},
    js_string,
};
use temporal_rs::{
    options::{
        DifferenceSettings, Disambiguation, DisplayCalendar, DisplayOffset, DisplayTimeZone,
        OffsetDisambiguation, Overflow, RoundingIncrement, RoundingMode, Unit,
    },
    parsers::Precision,
    provider::TransitionDirection,
};

// TODO: Expand docs on the below options.

/// Gets the `TemporalUnit` from an options object.
#[inline]
pub(crate) fn get_temporal_unit(
    options: &JsObject,
    key: JsString,
    unit_group: TemporalUnitGroup,
    extra_values: Option<Vec<Unit>>,
    context: &mut Context,
) -> JsResult<Option<Unit>> {
    let extra = extra_values.unwrap_or_default();
    let mut unit_values = unit_group.group();
    unit_values.extend(extra);

    let unit = get_option(options, key, context)?;

    if let Some(u) = &unit
        && !unit_values.contains(u)
    {
        return Err(JsNativeError::range()
            .with_message("TemporalUnit was not part of the valid UnitGroup.")
            .into());
    }

    Ok(unit)
}

#[inline]
pub(crate) fn get_difference_settings(
    options: &JsObject,
    context: &mut Context,
) -> JsResult<DifferenceSettings> {
    let mut settings = DifferenceSettings::default();
    settings.largest_unit = get_option::<Unit>(options, js_string!("largestUnit"), context)?;
    settings.increment =
        get_option::<RoundingIncrement>(options, js_string!("roundingIncrement"), context)?;
    settings.rounding_mode =
        get_option::<RoundingMode>(options, js_string!("roundingMode"), context)?;
    settings.smallest_unit = get_option::<Unit>(options, js_string!("smallestUnit"), context)?;
    Ok(settings)
}

pub(crate) fn get_digits_option(options: &JsObject, context: &mut Context) -> JsResult<Precision> {
    // 1. Let digitsValue be ? Get(options, "fractionalSecondDigits").
    let digits_value = options.get(js_string!("fractionalSecondDigits"), context)?;
    // 2. If digitsValue is undefined, return auto.
    if digits_value.is_undefined() {
        return Ok(Precision::Auto);
    }
    // 3. If digitsValue is not a Number, then
    let Some(digits_number) = digits_value.as_number() else {
        // a. If ? ToString(digitsValue) is not "auto", throw a RangeError exception.
        if digits_value.to_string(context)? != js_string!("auto") {
            return Err(JsNativeError::range()
                .with_message("fractionalSecondDigits must be a digit or 'auto'")
                .into());
        }
        // b. Return auto.
        return Ok(Precision::Auto);
    };

    // 4. If digitsValue is NaN, +∞𝔽, or -∞𝔽, throw a RangeError exception.
    if !digits_number.is_finite() {
        return Err(JsNativeError::range()
            .with_message("fractionalSecondDigits must be a finite number")
            .into());
    }
    // 5. Let digitCount be floor(ℝ(digitsValue)).
    let digits = digits_number.floor() as i32;
    // 6. If digitCount < 0 or digitCount > 9, throw a RangeError exception.
    if !(0..=9).contains(&digits) {
        return Err(JsNativeError::range()
            .with_message("fractionalSecondDigits must be in an inclusive range of 0-9")
            .into());
    }
    // 7. Return digitCount.
    Ok(Precision::Digit(digits as u8))
}

#[derive(Debug, Clone, Copy)]
#[allow(unused)]
pub(crate) enum TemporalUnitGroup {
    Date, // Need to assert if this is needed anymore with the removal of `Temporal.Calendar`
    Time,
    DateTime,
}

impl TemporalUnitGroup {
    fn group(self) -> Vec<Unit> {
        use TemporalUnitGroup::{Date, DateTime, Time};

        match self {
            Date => date_units().collect(),
            Time => time_units().collect(),
            DateTime => datetime_units().collect(),
        }
    }
}

fn time_units() -> impl Iterator<Item = Unit> {
    [
        Unit::Hour,
        Unit::Minute,
        Unit::Second,
        Unit::Millisecond,
        Unit::Microsecond,
        Unit::Nanosecond,
    ]
    .iter()
    .copied()
}

fn date_units() -> impl Iterator<Item = Unit> {
    [Unit::Year, Unit::Month, Unit::Week, Unit::Day]
        .iter()
        .copied()
}

fn datetime_units() -> impl Iterator<Item = Unit> {
    date_units().chain(time_units())
}

impl ParsableOptionType for Unit {}
impl ParsableOptionType for Overflow {}
impl ParsableOptionType for Disambiguation {}
impl ParsableOptionType for OffsetDisambiguation {}
impl ParsableOptionType for RoundingMode {}
impl ParsableOptionType for DisplayCalendar {}
impl ParsableOptionType for DisplayOffset {}
impl ParsableOptionType for DisplayTimeZone {}
impl ParsableOptionType for TransitionDirection {}

impl OptionType for RoundingIncrement {
    fn from_value(value: JsValue, context: &mut Context) -> JsResult<Self> {
        let value = value.to_number(context)?;

        Ok(RoundingIncrement::try_from(value)?)
    }
}
