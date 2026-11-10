use std::fmt;

use fixed_decimal::{
    Decimal, FloatPrecision, RoundingIncrement as BaseMultiple, SignDisplay, SignedRoundingMode,
    UnsignedRoundingMode,
};

use boa_macros::js_str;
use icu_decimal::{
    DecimalFormatterPreferences, preferences::NumberingSystem, provider::DecimalSymbolsV1,
};
use icu_locale::extensions::unicode::Value;
use icu_provider::{
    DataMarkerAttributes,
    prelude::icu_locale_core::{
        LanguageIdentifier, extensions::unicode, preferences::LocalePreferences,
    },
};
use tinystr::TinyAsciiStr;

use crate::{
    Context, JsExpect, JsNativeError, JsObject, JsResult, JsStr, JsString, JsValue,
    builtins::{
        intl::{
            ServicePreferences,
            locale::validate_extension,
            options::{default_number_option, get_number_option},
        },
        options::{OptionType, ParsableOptionType, get_option},
    },
    context::icu::IntlProvider,
    js_string,
};

impl OptionType for SignedRoundingMode {
    fn from_value(value: JsValue, context: &mut Context) -> JsResult<Self> {
        match value.to_string(context)?.to_std_string_escaped().as_str() {
            "expand" => Ok(Self::Unsigned(UnsignedRoundingMode::Expand)),
            "trunc" => Ok(Self::Unsigned(UnsignedRoundingMode::Trunc)),
            "halfExpand" => Ok(Self::Unsigned(UnsignedRoundingMode::HalfExpand)),
            "halfTrunc" => Ok(Self::Unsigned(UnsignedRoundingMode::HalfTrunc)),
            "halfEven" => Ok(Self::Unsigned(UnsignedRoundingMode::HalfEven)),
            "ceil" => Ok(Self::Ceil),
            "floor" => Ok(Self::Floor),
            "halfCeil" => Ok(Self::HalfCeil),
            "halfFloor" => Ok(Self::HalfFloor),
            _ => Err(JsNativeError::range()
                .with_message("provided string was not a valid rounding type")
                .into()),
        }
    }
}

impl OptionType for NumberingSystem {
    fn from_value(value: JsValue, context: &mut Context) -> JsResult<Self> {
        let s = value.to_string(context)?.to_std_string_escaped();
        Value::try_from_str(&s)
            .ok()
            .and_then(|v| NumberingSystem::try_from(v).ok())
            .filter(|nu| nu.as_str().len() >= 3)
            .ok_or_else(|| {
                JsNativeError::range()
                    .with_message(format!("provided numbering system `{s}` is invalid"))
                    .into()
            })
    }
}

#[derive(Debug, Copy, Clone, Default, Eq, PartialEq)]
pub(crate) enum Style {
    #[default]
    Decimal,
    Percent,
    Currency,
    Unit,
}

impl Style {
    pub(crate) fn to_js_string(self) -> JsString {
        match self {
            Style::Decimal => js_string!("decimal"),
            Style::Percent => js_string!("percent"),
            Style::Currency => js_string!("currency"),
            Style::Unit => js_string!("unit"),
        }
    }
}

#[derive(Debug)]
pub(crate) struct ParseStyleError;

impl fmt::Display for ParseStyleError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("provided string was not a valid style option")
    }
}

impl std::str::FromStr for Style {
    type Err = ParseStyleError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "decimal" => Ok(Self::Decimal),
            "percent" => Ok(Self::Percent),
            "currency" => Ok(Self::Currency),
            "unit" => Ok(Self::Unit),
            _ => Err(ParseStyleError),
        }
    }
}

impl ParsableOptionType for Style {}

#[derive(Debug, Copy, Clone, Default, Eq, PartialEq)]
pub(crate) enum CurrencyDisplay {
    Code,
    #[default]
    Symbol,
    NarrowSymbol,
    Name,
}

impl CurrencyDisplay {
    pub(crate) fn to_js_string(self) -> JsString {
        match self {
            CurrencyDisplay::Code => js_string!("code"),
            CurrencyDisplay::Symbol => js_string!("symbol"),
            CurrencyDisplay::NarrowSymbol => js_string!("narrowSymbol"),
            CurrencyDisplay::Name => js_string!("name"),
        }
    }
}

#[derive(Debug)]
pub(crate) struct ParseCurrencyDisplayError;

impl fmt::Display for ParseCurrencyDisplayError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("provided string was not a valid currencyDisplay option")
    }
}

impl std::str::FromStr for CurrencyDisplay {
    type Err = ParseCurrencyDisplayError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "code" => Ok(Self::Code),
            "symbol" => Ok(Self::Symbol),
            "narrowSymbol" => Ok(Self::NarrowSymbol),
            "name" => Ok(Self::Name),
            _ => Err(ParseCurrencyDisplayError),
        }
    }
}

impl ParsableOptionType for CurrencyDisplay {}

#[derive(Debug, Copy, Clone, Default, Eq, PartialEq)]
pub(crate) enum CurrencySign {
    #[default]
    Standard,
    Accounting,
}

impl CurrencySign {
    pub(crate) fn to_js_string(self) -> JsString {
        match self {
            CurrencySign::Standard => js_string!("standard"),
            CurrencySign::Accounting => js_string!("accounting"),
        }
    }
}

#[derive(Debug)]
pub(crate) struct ParseCurrencySignError;

impl fmt::Display for ParseCurrencySignError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("provided string was not a valid currencySign option")
    }
}

impl std::str::FromStr for CurrencySign {
    type Err = ParseCurrencySignError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "standard" => Ok(Self::Standard),
            "accounting" => Ok(Self::Accounting),
            _ => Err(ParseCurrencySignError),
        }
    }
}

impl ParsableOptionType for CurrencySign {}

#[derive(Debug, Copy, Clone, Default, Eq, PartialEq)]
pub(crate) enum UnitDisplay {
    #[default]
    Short,
    Narrow,
    Long,
}

impl UnitDisplay {
    pub(crate) fn to_js_string(self) -> JsString {
        match self {
            UnitDisplay::Short => js_string!("short"),
            UnitDisplay::Narrow => js_string!("narrow"),
            UnitDisplay::Long => js_string!("long"),
        }
    }
}

#[derive(Debug)]
pub(crate) struct ParseUnitDisplayError;

impl fmt::Display for ParseUnitDisplayError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("provided string was not a valid unitDisplay option")
    }
}

impl std::str::FromStr for UnitDisplay {
    type Err = ParseUnitDisplayError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "short" => Ok(Self::Short),
            "narrow" => Ok(Self::Narrow),
            "long" => Ok(Self::Long),
            _ => Err(ParseUnitDisplayError),
        }
    }
}

impl ParsableOptionType for UnitDisplay {}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) struct Currency {
    // INVARIANT: `inner` must contain only uppercase alphabetic letters.
    inner: TinyAsciiStr<3>,
}

impl Currency {
    pub(crate) fn to_js_string(self) -> JsString {
        let bytes = self.inner.as_bytes();
        js_string!(&[
            u16::from(bytes[0]),
            u16::from(bytes[1]),
            u16::from(bytes[2])
        ])
    }
}

#[derive(Debug)]
pub(crate) struct ParseCurrencyError;

impl fmt::Display for ParseCurrencyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("provided string was not a valid currency")
    }
}

impl std::str::FromStr for Currency {
    type Err = ParseCurrencyError;

    /// Equivalent to [`IsWellFormedCurrencyCode ( currency )`][spec].
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-iswellformedcurrencycode
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        // 1. If the length of currency is not 3, return false.
        let bytes = s.as_bytes();

        if bytes.len() != 3 {
            return Err(ParseCurrencyError);
        }

        let curr = TinyAsciiStr::try_from_utf8(bytes).map_err(|_| ParseCurrencyError)?;

        // 2. Let normalized be the ASCII-uppercase of currency.
        // 3. If normalized contains any code unit outside of 0x0041 through 0x005A (corresponding
        //    to Unicode characters LATIN CAPITAL LETTER A through LATIN CAPITAL LETTER Z), return false.
        if !curr.is_ascii_alphabetic() {
            return Err(ParseCurrencyError);
        }

        // 4. Return true.
        Ok(Currency {
            inner: curr.to_ascii_uppercase(),
        })
    }
}

impl ParsableOptionType for Currency {}

#[derive(Debug, Eq, PartialEq)]
pub(crate) struct Unit {
    // INVARIANT: `numerator` must only contain ASCII lowercase alphabetic letters or `-`.
    numerator: JsStr<'static>,
    // INVARIANT: if `denominator` is not empty, it must only contain ASCII lowercase alphabetic letters or `-`
    denominator: JsStr<'static>,
}

impl Unit {
    /// Gets the corresponding `JsString` of this unit.
    pub(crate) fn to_js_string(&self) -> JsString {
        if self.denominator.is_empty() {
            js_string!(self.numerator)
        } else {
            // TODO: this is not optimal for now, but the new JS strings should
            // allow us to optimize this to simple casts from ASCII to JsString.
            js_string!(self.numerator, js_str!("-per-"), self.denominator)
        }
    }
}

#[derive(Debug)]
pub(crate) struct ParseUnitError;

impl fmt::Display for ParseUnitError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("provided string was not a valid unit")
    }
}

impl std::str::FromStr for Unit {
    type Err = ParseUnitError;

    /// Equivalent to [`IsWellFormedUnitIdentifier ( unitIdentifier )`][spec].
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-iswellformedunitidentifier
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        const SANCTIONED_UNITS: [&str; 45] = [
            "acre",
            "bit",
            "byte",
            "celsius",
            "centimeter",
            "day",
            "degree",
            "fahrenheit",
            "fluid-ounce",
            "foot",
            "gallon",
            "gigabit",
            "gigabyte",
            "gram",
            "hectare",
            "hour",
            "inch",
            "kilobit",
            "kilobyte",
            "kilogram",
            "kilometer",
            "liter",
            "megabit",
            "megabyte",
            "meter",
            "microsecond",
            "mile",
            "mile-scandinavian",
            "milliliter",
            "millimeter",
            "millisecond",
            "minute",
            "month",
            "nanosecond",
            "ounce",
            "percent",
            "petabyte",
            "pound",
            "second",
            "stone",
            "terabit",
            "terabyte",
            "week",
            "yard",
            "year",
        ];

        let (num, den) = s
            .split_once("-per-")
            .filter(|(_, den)| !den.is_empty())
            .unwrap_or((s, ""));

        let num = SANCTIONED_UNITS
            .binary_search(&num)
            .map(|i| SANCTIONED_UNITS[i])
            .map_err(|_| ParseUnitError)?;

        let num = JsStr::latin1(num.as_bytes());

        let den = if den.is_empty() {
            JsStr::EMPTY
        } else {
            let value = SANCTIONED_UNITS
                .binary_search(&den)
                .map(|i| SANCTIONED_UNITS[i])
                .map_err(|_| ParseUnitError)?;

            JsStr::latin1(value.as_bytes())
        };

        Ok(Self {
            numerator: num,
            denominator: den,
        })
    }
}

impl ParsableOptionType for Unit {}

#[derive(Debug)]
#[allow(variant_size_differences)] // 40 bytes is not big enough to require moving `Unit` to the heap.
pub(crate) enum UnitFormatOptions {
    Decimal,
    Percent,
    Currency {
        currency: Currency,
        display: CurrencyDisplay,
        sign: CurrencySign,
    },
    Unit {
        unit: Unit,
        display: UnitDisplay,
    },
}

impl UnitFormatOptions {
    /// Gets the style variant of the `UnitFormatOptions`.
    pub(crate) fn style(&self) -> Style {
        match self {
            Self::Decimal => Style::Decimal,
            Self::Percent => Style::Percent,
            Self::Currency { .. } => Style::Currency,
            Self::Unit { .. } => Style::Unit,
        }
    }

    /// Abstract operation [`SetNumberFormatUnitOptions ( intlObj, options )`][spec].
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-setnumberformatunitoptions
    pub(crate) fn from_options(options: &JsObject, context: &mut Context) -> JsResult<Self> {
        // 1. Let style be ? GetOption(options, "style", string, « "decimal", "percent", "currency", "unit" », "decimal").
        // 2. Set intlObj.[[Style]] to style.
        let style: Style = get_option(options, js_string!("style"), context)?.unwrap_or_default();

        // 3. Let currency be ? GetOption(options, "currency", string, empty, undefined).
        // 5. Else,
        //     a. If IsWellFormedCurrencyCode(currency) is false, throw a RangeError exception.
        let currency = get_option(options, js_string!("currency"), context)?;

        // 4. If currency is undefined, then
        if currency.is_none() {
            // a. If style is "currency", throw a TypeError exception.
            if style == Style::Currency {
                return Err(JsNativeError::typ()
                    .with_message(
                        "cannot format on the currency style without specifying a target currency",
                    )
                    .into());
            }
        }

        // 6. Let currencyDisplay be ? GetOption(options, "currencyDisplay", string, « "code", "symbol", "narrowSymbol", "name" », "symbol").
        let currency_display =
            get_option(options, js_string!("currencyDisplay"), context)?.unwrap_or_default();

        // 7. Let currencySign be ? GetOption(options, "currencySign", string, « "standard", "accounting" », "standard").
        let currency_sign =
            get_option(options, js_string!("currencySign"), context)?.unwrap_or_default();

        // 8. Let unit be ? GetOption(options, "unit", string, empty, undefined).
        // 10. Else,
        //     a. If IsWellFormedUnitIdentifier(unit) is false, throw a RangeError exception.
        let unit = get_option(options, js_string!("unit"), context)?;
        // 9. If unit is undefined, then
        if unit.is_none() {
            // a. If style is "unit", throw a TypeError exception.
            if style == Style::Unit {
                return Err(JsNativeError::typ()
                    .with_message(
                        "cannot format on the unit style without specifying a target unit",
                    )
                    .into());
            }
        }

        // 11. Let unitDisplay be ? GetOption(options, "unitDisplay", string, « "short", "narrow", "long" », "short").
        let unit_display =
            get_option(options, js_string!("unitDisplay"), context)?.unwrap_or_default();

        // 14. Return unused.
        Ok(match style {
            Style::Decimal => UnitFormatOptions::Decimal,
            Style::Percent => UnitFormatOptions::Percent,
            // 12. If style is "currency", then
            Style::Currency => {
                UnitFormatOptions::Currency {
                    // a. Set intlObj.[[Currency]] to the ASCII-uppercase of currency.
                    currency: currency.js_expect("asserted above that `currency` is not None")?,
                    // b. Set intlObj.[[CurrencyDisplay]] to currencyDisplay.
                    display: currency_display,
                    // c. Set intlObj.[[CurrencySign]] to currencySign.
                    sign: currency_sign,
                }
            }
            // 13. If style is "unit", then
            Style::Unit => {
                UnitFormatOptions::Unit {
                    //     a. Set intlObj.[[Unit]] to unit.
                    unit: unit.js_expect("asserted above that `unit` is not None")?,
                    // b. Set intlObj.[[UnitDisplay]] to unitDisplay.
                    display: unit_display,
                }
            }
        })
    }
}

#[derive(Debug)]
pub(crate) struct DigitFormatOptions {
    pub(crate) minimum_integer_digits: u8,
    pub(crate) rounding_increment: RoundingIncrement,
    pub(crate) rounding_mode: SignedRoundingMode,
    pub(crate) trailing_zero_display: TrailingZeroDisplay,
    pub(crate) rounding_type: RoundingType,
    pub(crate) rounding_priority: RoundingPriority,
}

impl DigitFormatOptions {
    /// Abstract operation [`SetNumberFormatDigitOptions ( intlObj, options, mnfdDefault, mxfdDefault, notation )`][spec].
    ///
    /// Gets the digit format options of the number formatter from the options object and the requested notation.
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-setnfdigitoptions
    pub(crate) fn from_options(
        options: &JsObject,
        min_float_digits_default: u8,
        mut max_float_digits_default: u8,
        notation: NotationKind,
        context: &mut Context,
    ) -> JsResult<Self> {
        // 1. Let mnid be ? GetNumberOption(options, "minimumIntegerDigits,", 1, 21, 1).
        let minimum_integer_digits =
            get_number_option(options, js_string!("minimumIntegerDigits"), 1, 21, context)?
                .unwrap_or(1);
        // 2. Let mnfd be ? Get(options, "minimumFractionDigits").
        let min_float_digits = options.get(js_string!("minimumFractionDigits"), context)?;
        // 3. Let mxfd be ? Get(options, "maximumFractionDigits").
        let max_float_digits = options.get(js_string!("maximumFractionDigits"), context)?;
        // 4. Let mnsd be ? Get(options, "minimumSignificantDigits").
        let min_sig_digits = options.get(js_string!("minimumSignificantDigits"), context)?;
        // 5. Let mxsd be ? Get(options, "maximumSignificantDigits").
        let max_sig_digits = options.get(js_string!("maximumSignificantDigits"), context)?;

        // 7. Let roundingIncrement be ? GetNumberOption(options, "roundingIncrement", 1, 5000, 1).
        // 8. If roundingIncrement is not in « 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000 », throw a RangeError exception.
        let rounding_increment =
            get_number_option(options, js_string!("roundingIncrement"), 1, 5000, context)?
                .unwrap_or(1);
        let rounding_increment =
            RoundingIncrement::from_u16(rounding_increment).ok_or_else(|| {
                JsNativeError::range().with_message("invalid value for option `roundingIncrement`")
            })?;

        // 9. Let roundingMode be ? GetOption(options, "roundingMode", string, « "ceil", "floor", "expand", "trunc", "halfCeil", "halfFloor", "halfExpand", "halfTrunc", "halfEven" », "halfExpand").
        let rounding_mode = get_option(options, js_string!("roundingMode"), context)?.unwrap_or(
            SignedRoundingMode::Unsigned(UnsignedRoundingMode::HalfExpand),
        );

        // 10. Let roundingPriority be ? GetOption(options, "roundingPriority", string, « "auto", "morePrecision", "lessPrecision" », "auto").
        let mut rounding_priority =
            get_option(options, js_string!("roundingPriority"), context)?.unwrap_or_default();

        // 11. Let trailingZeroDisplay be ? GetOption(options, "trailingZeroDisplay", string, « "auto", "stripIfInteger" », "auto").
        let trailing_zero_display =
            get_option(options, js_string!("trailingZeroDisplay"), context)?.unwrap_or_default();

        // 12. NOTE: All fields required by SetNumberFormatDigitOptions have now been read from options. The remainder of this AO interprets the options and may throw exceptions.

        // 13. If roundingIncrement is not 1, set mxfdDefault to mnfdDefault.
        if rounding_increment.to_u16() != 1 {
            max_float_digits_default = min_float_digits_default;
        }

        // 17. If mnsd is not undefined or mxsd is not undefined, then
        //     a. Let hasSd be true.
        // 18. Else,
        //     a. Let hasSd be false.
        let has_sig_limits = !min_sig_digits.is_undefined() || !max_sig_digits.is_undefined();

        // 19. If mnfd is not undefined or mxfd is not undefined, then
        //     a. Let hasFd be true.
        // 20. Else,
        //     a. Let hasFd be false.
        let has_float_limits = !min_float_digits.is_undefined() || !max_float_digits.is_undefined();

        // 21. Let needSd be true.
        // 22. Let needFd be true.
        let (need_sig_limits, need_frac_limits) = if rounding_priority == RoundingPriority::Auto {
            // 23. If roundingPriority is "auto", then
            //     a. Set needSd to hasSd.
            //     b. If needSd is true, or hasFd is false and notation is "compact", then
            //         i. Set needFd to false.
            (
                has_sig_limits,
                !has_sig_limits && (has_float_limits || notation != NotationKind::Compact),
            )
        } else {
            (true, true)
        };

        // 24. If needSd is true, then
        let sig_digits = if need_sig_limits {
            // a. If hasSd is true, then
            let extrema = if has_sig_limits {
                // i. Set intlObj.[[MinimumSignificantDigits]] to ? DefaultNumberOption(mnsd, 1, 21, 1).
                let min_sig = default_number_option(&min_sig_digits, 1, 21, context)?.unwrap_or(1);
                // ii. Set intlObj.[[MaximumSignificantDigits]] to ? DefaultNumberOption(mxsd, intlObj.[[MinimumSignificantDigits]], 21, 21).
                let max_sig =
                    default_number_option(&max_sig_digits, min_sig, 21, context)?.unwrap_or(21);

                Extrema {
                    minimum: min_sig,
                    maximum: max_sig,
                }
            } else {
                // b. Else,
                Extrema {
                    // i. Set intlObj.[[MinimumSignificantDigits]] to 1.
                    minimum: 1,
                    // ii. Set intlObj.[[MaximumSignificantDigits]] to 21.
                    maximum: 21,
                }
            };
            assert!(extrema.minimum <= extrema.maximum);
            Some(extrema)
        } else {
            None
        };

        // 25. If needFd is true, then
        let fractional_digits = if need_frac_limits {
            //     a. If hasFd is true, then
            let extrema = if has_float_limits {
                // i. Set mnfd to ? DefaultNumberOption(mnfd, 0, 100, undefined).
                let min_float_digits = default_number_option(&min_float_digits, 0, 100, context)?;
                // ii. Set mxfd to ? DefaultNumberOption(mxfd, 0, 100, undefined).
                let max_float_digits = default_number_option(&max_float_digits, 0, 100, context)?;

                let (min_float_digits, max_float_digits) =
                    match (min_float_digits, max_float_digits) {
                        (Some(min_float_digits), Some(max_float_digits)) => {
                            // v. Else if mnfd is greater than mxfd, throw a RangeError exception.
                            if min_float_digits > max_float_digits {
                                return Err(JsNativeError::range().with_message(
                            "`minimumFractionDigits` cannot be bigger than `maximumFractionDigits`",
                        ).into());
                            }
                            (min_float_digits, max_float_digits)
                        }
                        // iv. Else if mxfd is undefined, set mxfd to max(mxfdDefault, mnfd).
                        (Some(min_float_digits), None) => (
                            min_float_digits,
                            u8::max(max_float_digits_default, min_float_digits),
                        ),
                        // iii. If mnfd is undefined, set mnfd to min(mnfdDefault, mxfd).
                        (None, Some(max_float_digits)) => (
                            u8::min(min_float_digits_default, max_float_digits),
                            max_float_digits,
                        ),
                        (None, None) => {
                            unreachable!(
                                "`has_fd` can only be true if `mnfd` or `mxfd` is not undefined"
                            )
                        }
                    };

                Extrema {
                    // vi. Set intlObj.[[MinimumFractionDigits]] to mnfd.
                    minimum: min_float_digits,
                    // vii. Set intlObj.[[MaximumFractionDigits]] to mxfd.
                    maximum: max_float_digits,
                }
            } else {
                // b. Else,
                Extrema {
                    //    i. Set intlObj.[[MinimumFractionDigits]] to mnfdDefault.
                    minimum: min_float_digits_default,
                    //    ii. Set intlObj.[[MaximumFractionDigits]] to mxfdDefault.
                    maximum: max_float_digits_default,
                }
            };
            assert!(extrema.minimum <= extrema.maximum);
            Some(extrema)
        } else {
            None
        };

        let rounding_type = match (sig_digits, fractional_digits) {
            // 26. If needSd is false and needFd is false, then
            (None, None) => {
                // f. Set intlObj.[[ComputedRoundingPriority]] to "morePrecision".
                rounding_priority = RoundingPriority::MorePrecision;
                // e. Set intlObj.[[RoundingType]] to morePrecision.
                RoundingType::MorePrecision {
                    significant_digits: Extrema {
                        // c. Set intlObj.[[MinimumSignificantDigits]] to 1.
                        minimum: 1,
                        // d. Set intlObj.[[MaximumSignificantDigits]] to 2.
                        maximum: 2,
                    },
                    fraction_digits: Extrema {
                        // a. Set intlObj.[[MinimumFractionDigits]] to 0.
                        minimum: 0,
                        // b. Set intlObj.[[MaximumFractionDigits]] to 0.
                        maximum: 0,
                    },
                }
            }
            (Some(significant_digits), Some(fraction_digits)) => match rounding_priority {
                RoundingPriority::MorePrecision => RoundingType::MorePrecision {
                    significant_digits,
                    fraction_digits,
                },
                RoundingPriority::LessPrecision => RoundingType::LessPrecision {
                    significant_digits,
                    fraction_digits,
                },
                RoundingPriority::Auto => {
                    unreachable!("Cannot have both roundings when the priority is `Auto`")
                }
            },
            (Some(sig), None) => RoundingType::SignificantDigits(sig),
            (None, Some(frac)) => RoundingType::FractionDigits(frac),
        };

        if rounding_increment.to_u16() != 1 {
            let RoundingType::FractionDigits(range) = rounding_type else {
                return Err(JsNativeError::typ()
                    .with_message(
                        "option `roundingIncrement` invalid for the current set of options",
                    )
                    .into());
            };

            if range.minimum != range.maximum {
                return Err(JsNativeError::range()
                    .with_message(
                        "option `roundingIncrement` invalid for the current set of options",
                    )
                    .into());
            }
        }

        Ok(Self {
            // 6. Set intlObj.[[MinimumIntegerDigits]] to mnid.
            minimum_integer_digits,
            // 14. Set intlObj.[[RoundingIncrement]] to roundingIncrement.
            rounding_increment,
            // 15. Set intlObj.[[RoundingMode]] to roundingMode.
            rounding_mode,
            // 16. Set intlObj.[[TrailingZeroDisplay]] to trailingZeroDisplay.
            trailing_zero_display,
            rounding_type,
            rounding_priority,
        })
    }

    /// Abstract operation [`FormatNumericToString ( intlObject, x )`][spec].
    ///
    /// Formats a `FixedDecimal` with the specified digit format options.
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-formatnumberstring
    pub(crate) fn format_fixed_decimal(&self, number: &mut Decimal) {
        fn round(
            number: &mut Decimal,
            position: i16,
            mode: SignedRoundingMode,
            multiple: BaseMultiple,
        ) {
            number.round_with_mode_and_increment(position, mode, multiple);
        }

        // <https://tc39.es/ecma402/#sec-torawprecision>
        fn to_raw_precision(
            number: &mut Decimal,
            min_precision: u8,
            max_precision: u8,
            rounding_mode: SignedRoundingMode,
        ) -> i16 {
            let msb = number.nonzero_magnitude_start();
            let min_msb = msb - i16::from(min_precision) + 1;
            let max_msb = msb - i16::from(max_precision) + 1;
            round(number, max_msb, rounding_mode, BaseMultiple::MultiplesOf1);
            number.trim_end();
            number.pad_end(min_msb);
            max_msb
        }

        // <https://tc39.es/ecma402/#sec-torawfixed>
        fn to_raw_fixed(
            number: &mut Decimal,
            min_fraction: u8,
            max_fraction: u8,
            rounding_increment: RoundingIncrement,
            rounding_mode: SignedRoundingMode,
        ) -> i16 {
            #[cfg(debug_assertions)]
            if rounding_increment.to_u16() != 1 {
                assert_eq!(min_fraction, max_fraction);
            }

            round(
                number,
                i16::from(rounding_increment.magnitude_offset) - i16::from(max_fraction),
                rounding_mode,
                rounding_increment.multiple,
            );
            number.trim_end();
            number.pad_end(-i16::from(min_fraction));
            -i16::from(max_fraction)
        }

        // 3. Let unsignedRoundingMode be GetUnsignedRoundingMode(intlObject.[[RoundingMode]], isNegative).
        // Skipping because `FixedDecimal`'s API already provides methods equivalent to `RoundingMode`s.

        match self.rounding_type {
            // 4. If intlObject.[[RoundingType]] is significantDigits, then
            RoundingType::SignificantDigits(Extrema { minimum, maximum }) => {
                // a. Let result be ToRawPrecision(x, intlObject.[[MinimumSignificantDigits]], intlObject.[[MaximumSignificantDigits]], unsignedRoundingMode).
                to_raw_precision(number, minimum, maximum, self.rounding_mode);
            }
            // 5. Else if intlObject.[[RoundingType]] is fractionDigits, then
            RoundingType::FractionDigits(Extrema { minimum, maximum }) => {
                // a. Let result be ToRawFixed(x, intlObject.[[MinimumFractionDigits]], intlObject.[[MaximumFractionDigits]], intlObject.[[RoundingIncrement]], unsignedRoundingMode).
                to_raw_fixed(
                    number,
                    minimum,
                    maximum,
                    self.rounding_increment,
                    self.rounding_mode,
                );
            }
            // 6. Else,
            RoundingType::MorePrecision {
                significant_digits,
                fraction_digits,
            }
            | RoundingType::LessPrecision {
                significant_digits,
                fraction_digits,
            } => {
                let prefer_more_precision =
                    matches!(self.rounding_type, RoundingType::MorePrecision { .. });
                // a. Let sResult be ToRawPrecision(x, intlObject.[[MinimumSignificantDigits]], intlObject.[[MaximumSignificantDigits]], unsignedRoundingMode).
                let mut fixed = number.clone();
                let s_magnitude = to_raw_precision(
                    number,
                    significant_digits.minimum,
                    significant_digits.maximum,
                    self.rounding_mode,
                );
                // b. Let fResult be ToRawFixed(x, intlObject.[[MinimumFractionDigits]], intlObject.[[MaximumFractionDigits]], intlObject.[[RoundingIncrement]], unsignedRoundingMode).
                let f_magnitude = to_raw_fixed(
                    &mut fixed,
                    fraction_digits.minimum,
                    fraction_digits.maximum,
                    self.rounding_increment,
                    self.rounding_mode,
                );

                // c. If intlObject.[[RoundingType]] is morePrecision, then
                //     i. If sResult.[[RoundingMagnitude]] ≤ fResult.[[RoundingMagnitude]], then
                //         1. Let result be sResult.
                //     ii. Else,
                //         1. Let result be fResult.
                // d. Else,
                //     i. Assert: intlObject.[[RoundingType]] is lessPrecision.
                //     ii. If sResult.[[RoundingMagnitude]] ≤ fResult.[[RoundingMagnitude]], then
                //         1. Let result be fResult.
                //     iii. Else,
                //         1. Let result be sResult.
                if (prefer_more_precision && f_magnitude < s_magnitude)
                    || (!prefer_more_precision && s_magnitude <= f_magnitude)
                {
                    *number = fixed;
                }
            }
        }

        // 7. Set x to result.[[RoundedNumber]].
        // 8. Let string be result.[[FormattedString]].
        // 9. If intlObject.[[TrailingZeroDisplay]] is "stripIfInteger" and x modulo 1 = 0, then
        if self.trailing_zero_display == TrailingZeroDisplay::StripIfInteger {
            // a. Let i be StringIndexOf(string, ".", 0).
            // b. If i ≠ -1, set string to the substring of string from 0 to i.
            number.trim_end_if_integer();
        }

        // 10. Let int be result.[[IntegerDigitsCount]].
        // 11. Let minInteger be intlObject.[[MinimumIntegerDigits]].
        // 12. If int < minInteger, then
        //     a. Let forwardZeros be the String consisting of minInteger - int occurrences of the code unit 0x0030 (DIGIT ZERO).
        //     b. Set string to the string-concatenation of forwardZeros and string.
        number.pad_start(i16::from(self.minimum_integer_digits));

        // 13. If isNegative is true, then
        //     a. If x is 0, set x to negative-zero. Otherwise, set x to -x.
        // As mentioned above, `FixedDecimal` has support for this.
    }

    /// Abstract operation [`FormatNumericToString ( intlObject, x )`][spec].
    ///
    /// Converts the input number to a `FixedDecimal` with the specified digit format options.
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-formatnumberstring
    pub(crate) fn format_f64(&self, number: f64) -> Decimal {
        // 1. If x is negative-zero, then
        //     a. Let isNegative be true.
        //     b. Set x to 0.
        // 2. Else,
        //     a. Assert: x is a mathematical value.
        //     b. If x < 0, let isNegative be true; else let isNegative be false.
        //     c. If isNegative is true, then
        //         i. Set x to -x.
        // We can skip these steps, because `FixedDecimal` already provides support for
        // negative zeroes.
        let mut number = Decimal::try_from_f64(number, FloatPrecision::RoundTrip)
            .expect("`number` must be finite");

        self.format_fixed_decimal(&mut number);

        // 14. Return the Record { [[RoundedNumber]]: x, [[FormattedString]]: string }.
        number
    }
}

/// The increment of a rounding operation.
///
/// This differs from [`fixed_decimal::RoundingIncrement`] because ECMA402 accepts
/// several more increments than `fixed_decimal`, but all increments can be decomposed
/// into the target multiple and the magnitude offset.
///
/// For example, rounding the number `0.02456` to the increment 200 at position
/// -3 is equivalent to rounding the same number to the increment 2 at position -1, and adding
/// trailing zeroes.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) struct RoundingIncrement {
    multiple: BaseMultiple,
    magnitude_offset: u8,
}

impl RoundingIncrement {
    /// Creates a `RoundingIncrement` from its base multiple (1, 2, 5, or 25) and its
    /// exponent (1, 10, 100, or 1000).
    #[cfg(test)]
    pub(crate) const fn from_parts(multiple: BaseMultiple, exponent: u8) -> Option<Self> {
        if exponent > 3 {
            return None;
        }

        Some(Self {
            multiple,
            magnitude_offset: exponent,
        })
    }

    /// Creates a `RoundingIncrement` from the numeric value of the increment.
    pub(crate) fn from_u16(increment: u16) -> Option<Self> {
        let mut offset = 0u8;
        let multiple = loop {
            let rem = increment % 10u16.checked_pow(u32::from(offset + 1))?;

            if rem != 0 {
                break increment / 10u16.pow(u32::from(offset));
            }

            offset += 1;
        };

        if offset > 3 {
            return None;
        }

        let multiple = match multiple {
            1 => BaseMultiple::MultiplesOf1,
            2 => BaseMultiple::MultiplesOf2,
            5 => BaseMultiple::MultiplesOf5,
            25 => BaseMultiple::MultiplesOf25,
            _ => return None,
        };

        Some(RoundingIncrement {
            multiple,
            magnitude_offset: offset,
        })
    }

    /// Gets the numeric value of this `RoundingIncrement`.
    pub(crate) fn to_u16(self) -> u16 {
        u16::from(self.magnitude_offset + 1)
            * match self.multiple {
                BaseMultiple::MultiplesOf1 => 1,
                BaseMultiple::MultiplesOf2 => 2,
                BaseMultiple::MultiplesOf5 => 5,
                BaseMultiple::MultiplesOf25 => 25,
                _ => {
                    debug_assert!(false, "base multiples can only be 1, 2, 5, or 25");
                    1
                }
            }
    }
}

#[derive(Debug, Copy, Clone, Default, PartialEq, Eq)]
pub(crate) enum CompactDisplay {
    #[default]
    Short,
    Long,
}

impl CompactDisplay {
    pub(crate) fn to_js_string(self) -> JsString {
        match self {
            CompactDisplay::Short => js_string!("short"),
            CompactDisplay::Long => js_string!("long"),
        }
    }
}

#[derive(Debug)]
pub(crate) struct ParseCompactDisplayError;

impl fmt::Display for ParseCompactDisplayError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("provided string was not a valid compactDisplay option")
    }
}

impl std::str::FromStr for CompactDisplay {
    type Err = ParseCompactDisplayError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "short" => Ok(Self::Short),
            "long" => Ok(Self::Long),
            _ => Err(ParseCompactDisplayError),
        }
    }
}

impl ParsableOptionType for CompactDisplay {}

#[derive(Debug, Copy, Clone, Default, PartialEq, Eq)]
pub(crate) enum NotationKind {
    #[default]
    Standard,
    Scientific,
    Engineering,
    Compact,
}

impl NotationKind {
    pub(crate) fn to_js_string(self) -> JsString {
        match self {
            NotationKind::Standard => js_string!("standard"),
            NotationKind::Scientific => js_string!("scientific"),
            NotationKind::Engineering => js_string!("engineering"),
            NotationKind::Compact => js_string!("compact"),
        }
    }
}

#[derive(Debug)]
pub(crate) struct ParseNotationKindError;

impl fmt::Display for ParseNotationKindError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("provided string was not a valid notation option")
    }
}

impl std::str::FromStr for NotationKind {
    type Err = ParseNotationKindError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "standard" => Ok(Self::Standard),
            "scientific" => Ok(Self::Scientific),
            "engineering" => Ok(Self::Engineering),
            "compact" => Ok(Self::Compact),
            _ => Err(ParseNotationKindError),
        }
    }
}

impl ParsableOptionType for NotationKind {}

#[derive(Debug, Copy, Clone, Default, Eq, PartialEq)]
pub(crate) enum RoundingPriority {
    #[default]
    Auto,
    MorePrecision,
    LessPrecision,
}

impl RoundingPriority {
    pub(crate) fn to_js_string(self) -> JsString {
        match self {
            RoundingPriority::Auto => js_string!("auto"),
            RoundingPriority::MorePrecision => js_string!("morePrecision"),
            RoundingPriority::LessPrecision => js_string!("lessPrecision"),
        }
    }
}

#[derive(Debug)]
pub(crate) struct ParseRoundingPriorityError;

impl fmt::Display for ParseRoundingPriorityError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("provided string was not a valid rounding priority")
    }
}

impl std::str::FromStr for RoundingPriority {
    type Err = ParseRoundingPriorityError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "auto" => Ok(Self::Auto),
            "morePrecision" => Ok(Self::MorePrecision),
            "lessPrecision" => Ok(Self::LessPrecision),
            _ => Err(ParseRoundingPriorityError),
        }
    }
}

impl ParsableOptionType for RoundingPriority {}

#[derive(Debug, Copy, Clone, Default, PartialEq, Eq)]
pub(crate) enum TrailingZeroDisplay {
    #[default]
    Auto,
    StripIfInteger,
}

impl TrailingZeroDisplay {
    pub(crate) fn to_js_string(self) -> JsString {
        match self {
            TrailingZeroDisplay::Auto => js_string!("auto"),
            TrailingZeroDisplay::StripIfInteger => js_string!("stripIfInteger"),
        }
    }
}

#[derive(Debug)]
pub(crate) struct ParseTrailingZeroDisplayError;

impl fmt::Display for ParseTrailingZeroDisplayError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("provided string was not a valid trailing zero display option")
    }
}

impl std::str::FromStr for TrailingZeroDisplay {
    type Err = ParseTrailingZeroDisplayError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "auto" => Ok(Self::Auto),
            "stripIfInteger" => Ok(Self::StripIfInteger),
            _ => Err(ParseTrailingZeroDisplayError),
        }
    }
}

impl ParsableOptionType for TrailingZeroDisplay {}

impl OptionType for SignDisplay {
    fn from_value(value: JsValue, context: &mut Context) -> JsResult<Self> {
        match value.to_string(context)?.to_std_string_escaped().as_str() {
            "auto" => Ok(Self::Auto),
            "never" => Ok(Self::Never),
            "always" => Ok(Self::Always),
            "exceptZero" => Ok(Self::ExceptZero),
            "negative" => Ok(Self::Negative),
            _ => Err(JsNativeError::range()
                .with_message(
                    "provided string was not `auto`, `never`, `always`, `exceptZero`, or `negative`",
                )
                .into()),
        }
    }
}

#[derive(Debug, Copy, Clone)]
pub(crate) struct Extrema<T> {
    pub(crate) minimum: T,
    pub(crate) maximum: T,
}

#[derive(Debug, Copy, Clone)]
pub(crate) enum RoundingType {
    MorePrecision {
        significant_digits: Extrema<u8>,
        fraction_digits: Extrema<u8>,
    },
    LessPrecision {
        significant_digits: Extrema<u8>,
        fraction_digits: Extrema<u8>,
    },
    SignificantDigits(Extrema<u8>),
    FractionDigits(Extrema<u8>),
}

impl RoundingType {
    /// Gets the significant digit limits of the rounding type, or `None` otherwise.
    pub(crate) const fn significant_digits(self) -> Option<Extrema<u8>> {
        match self {
            Self::MorePrecision {
                significant_digits, ..
            }
            | Self::LessPrecision {
                significant_digits, ..
            }
            | Self::SignificantDigits(significant_digits) => Some(significant_digits),
            Self::FractionDigits(_) => None,
        }
    }

    /// Gets the fraction digit limits of the rounding type, or `None` otherwise.
    pub(crate) const fn fraction_digits(self) -> Option<Extrema<u8>> {
        match self {
            Self::MorePrecision {
                fraction_digits, ..
            }
            | Self::LessPrecision {
                fraction_digits, ..
            }
            | Self::FractionDigits(fraction_digits) => Some(fraction_digits),
            Self::SignificantDigits(_) => None,
        }
    }
}

impl ServicePreferences for DecimalFormatterPreferences {
    fn validate(&mut self, id: &LanguageIdentifier, provider: &IntlProvider) {
        self.numbering_system = self.numbering_system.take().filter(|nu| {
            let attr = DataMarkerAttributes::from_str_or_panic(nu.as_str());
            validate_extension::<DecimalSymbolsV1>(id, attr, provider)
        });
    }

    impl_service_preferences!(numbering_system);
}
