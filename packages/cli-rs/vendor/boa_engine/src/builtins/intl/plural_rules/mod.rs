mod options;

use boa_gc::{Finalize, Trace};
use fixed_decimal::{CompactDecimal, Decimal, SignedRoundingMode, UnsignedRoundingMode};
use icu_locale::Locale;
use icu_plurals::{
    PluralCategory, PluralRuleType, PluralRules as NativePluralRules, PluralRulesOptions,
    PluralRulesPreferences, PluralRulesWithRanges, provider::PluralsCardinalV1,
};

use crate::{
    Context, JsArgs, JsData, JsNativeError, JsObject, JsResult, JsString, JsSymbol, JsValue,
    builtins::{
        Array, BuiltInBuilder, BuiltInConstructor, BuiltInObject, IntrinsicObject,
        intl::options::EmptyPreferences, options::get_option,
    },
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    js_string,
    object::{ObjectInitializer, internal_methods::get_prototype_from_constructor},
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
};

use super::{
    Service,
    locale::{canonicalize_locale_list, filter_locales, resolve_locale},
    number_format::{DigitFormatOptions, Extrema, NotationKind},
    options::{IntlOptions, coerce_options_to_object},
};

#[derive(Debug, Trace, Finalize, JsData)]
// SAFETY: `PluralRules` doesn't contain any traceable data.
#[boa_gc(unsafe_empty_trace)]
pub(crate) struct PluralRules {
    locale: Locale,
    native: PluralRulesWithRanges<NativePluralRules>,
    rule_type: PluralRuleType,
    notation: NotationKind,
    format_options: DigitFormatOptions,
}

impl Service for PluralRules {
    type LangMarker = PluralsCardinalV1;

    type Preferences = EmptyPreferences;
}

impl IntrinsicObject for PluralRules {
    fn init(realm: &Realm) {
        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .static_method(
                Self::supported_locales_of,
                js_string!("supportedLocalesOf"),
                1,
            )
            .property(
                JsSymbol::to_string_tag(),
                js_string!("Intl.PluralRules"),
                Attribute::CONFIGURABLE,
            )
            .method(Self::resolved_options, js_string!("resolvedOptions"), 0)
            .method(Self::select, js_string!("select"), 1)
            .method(Self::select_range, js_string!("selectRange"), 2)
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInObject for PluralRules {
    const NAME: JsString = StaticJsStrings::PLURAL_RULES;
}

impl BuiltInConstructor for PluralRules {
    const CONSTRUCTOR_ARGUMENTS: usize = 0;
    const PROTOTYPE_STORAGE_SLOTS: usize = 4;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 1;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::plural_rules;

    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is undefined, throw a TypeError exception.
        if new_target.is_undefined() {
            return Err(JsNativeError::typ()
                .with_message("cannot call `Intl.PluralRules` constructor without `new`")
                .into());
        }

        // 2. Let pluralRules be ? OrdinaryCreateFromConstructor(NewTarget, "%PluralRules.prototype%",
        //    « [[InitializedPluralRules]], [[Locale]], [[Type]], [[MinimumIntegerDigits]],
        //    [[MinimumFractionDigits]], [[MaximumFractionDigits]], [[MinimumSignificantDigits]],
        //    [[MaximumSignificantDigits]], [[RoundingType]], [[RoundingIncrement]], [[RoundingMode]],
        //    [[ComputedRoundingPriority]], [[TrailingZeroDisplay]] »).
        let proto = get_prototype_from_constructor(
            new_target,
            StandardConstructors::plural_rules,
            context,
        )?;

        let locales = args.get_or_undefined(0);
        let options = args.get_or_undefined(1);

        // 3. Let optionsResolution be ? ResolveOptions(%Intl.PluralRules%, %Intl.PluralRules%.[[LocaleData]], locales, options, « coerce-options »).
        // 4. Set options to optionsResolution.[[Options]].
        // 5. Let r be optionsResolution.[[ResolvedLocale]].
        // 6. Set pluralRules.[[Locale]] to r.[[Locale]].
        // Inlined steps since every constructor needs its own handling.
        let requested_locales = canonicalize_locale_list(locales, context)?;
        let options = coerce_options_to_object(options, context)?;
        let matcher =
            get_option(&options, js_string!("localeMatcher"), context)?.unwrap_or_default();
        let locale = resolve_locale::<Self>(
            requested_locales,
            &mut IntlOptions {
                matcher,
                ..Default::default()
            },
            context.intl_provider(),
        )?;

        // 7. Let t be ? GetOption(options, "type", string, « "cardinal", "ordinal" », "cardinal").
        // 8. Set pluralRules.[[Type]] to t.
        let rule_type =
            get_option(&options, js_string!("type"), context)?.unwrap_or(PluralRuleType::Cardinal);

        // 9. Let notation be ? GetOption(options, "notation", string, « "standard", "scientific", "engineering", "compact" », "standard").
        // 10. Set pluralRules.[[Notation]] to notation.
        let notation = get_option(&options, js_string!("notation"), context)?
            .unwrap_or(NotationKind::Standard);

        // 11. Perform ? SetNumberFormatDigitOptions(pluralRules, options, 0, 3, notation).
        let format_options = DigitFormatOptions::from_options(&options, 0, 3, notation, context)?;

        let prefs = PluralRulesPreferences::from(&locale);
        let opts = PluralRulesOptions::from(rule_type);

        let native = PluralRulesWithRanges::try_new_with_buffer_provider(
            context.intl_provider().erased_provider(),
            prefs,
            opts,
        )
        .map_err(|e| JsNativeError::typ().with_message(e.to_string()))?;

        // 12. Return pluralRules.
        Ok(JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            proto,
            Self {
                locale,
                native,
                rule_type,
                notation,
                format_options,
            },
        )
        .into())
    }
}

impl PluralRules {
    /// [`Intl.PluralRules.prototype.select ( value )`][spec].
    ///
    /// Returns a string indicating which plural rule to use for locale-aware formatting of a number.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-intl.pluralrules.prototype.select
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules/select
    fn select(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let pr be the this value.
        // 2. Perform ? RequireInternalSlot(pr, [[InitializedPluralRules]]).
        let object = this.as_object();
        let plural_rules = object
            .as_ref()
            .and_then(|o| o.downcast_ref::<Self>())
            .ok_or_else(|| {
                JsNativeError::typ()
                    .with_message("`select` can only be called on an `Intl.PluralRules` object")
            })?;

        let n = args.get_or_undefined(0).to_number(context)?;

        Ok(plural_category_to_js_string(resolve_plural(&plural_rules, n).category).into())
    }

    /// [`Intl.PluralRules.prototype.selectRange ( start, end )`][spec].
    ///
    /// Receives two values and returns a string indicating which plural rule to use for
    /// locale-aware formatting of the indicated range.
    ///
    /// More information:
    /// - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-intl.pluralrules.prototype.selectrange
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules/selectRange
    fn select_range(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let pr be the this value.
        // 2. Perform ? RequireInternalSlot(pr, [[InitializedPluralRules]]).
        let object = this.as_object();
        let plural_rules = object
            .as_ref()
            .and_then(|o| o.downcast_ref::<Self>())
            .ok_or_else(|| {
                JsNativeError::typ().with_message(
                    "`select_range` can only be called on an `Intl.PluralRules` object",
                )
            })?;

        // 3. If start is undefined or end is undefined, throw a TypeError exception.
        let x = args.get_or_undefined(0);
        let y = args.get_or_undefined(1);
        if x.is_undefined() || y.is_undefined() {
            return Err(JsNativeError::typ()
                .with_message("extremum of range cannot be `undefined`")
                .into());
        }

        // 4. Let x be ? ToNumber(start).
        let x = x.to_number(context)?;
        // 5. Let y be ? ToNumber(end).
        let y = y.to_number(context)?;

        // 6. Return ? ResolvePluralRange(pr, x, y).
        // ResolvePluralRange(pr, x, y)
        // <https://tc39.es/ecma402/#sec-resolvepluralrange>

        // 1. If x is NaN or y is NaN, throw a RangeError exception.
        if x.is_nan() || y.is_nan() {
            return Err(JsNativeError::range()
                .with_message("arguments of selectRange cannot be NaN")
                .into());
        }

        // 2. Let xp be ResolvePlural(pluralRules, x).
        let x = resolve_plural(&plural_rules, x);
        // 3. Let yp be ResolvePlural(pluralRules, y).
        let y = resolve_plural(&plural_rules, y);

        // 4. If xp.[[FormattedString]] is yp.[[FormattedString]], then
        if x.formatted == y.formatted {
            // a. Return xp.[[PluralCategory]].
            return Ok(plural_category_to_js_string(x.category).into());
        }

        // 5. Let locale be pluralRules.[[Locale]].
        // 6. Let type be pluralRules.[[Type]].
        // 7. Return PluralRuleSelectRange(locale, type, xp.[[PluralCategory]], yp.[[PluralCategory]]).
        Ok(
            plural_category_to_js_string(plural_rules.native.resolve_range(x.category, y.category))
                .into(),
        )
    }

    /// [`Intl.PluralRules.supportedLocalesOf ( locales [ , options ] )`][spec].
    ///
    /// Returns an array containing those of the provided locales that are supported in plural rules
    /// without having to fall back to the runtime's default locale.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-intl.pluralrules.supportedlocalesof
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules/supportedLocalesOf
    fn supported_locales_of(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let locales = args.get_or_undefined(0);
        let options = args.get_or_undefined(1);

        // 1. Let availableLocales be %PluralRules%.[[AvailableLocales]].
        // 2. Let requestedLocales be ? CanonicalizeLocaleList(locales).
        let requested_locales = canonicalize_locale_list(locales, context)?;

        // 3. Return ? FilterLocales(availableLocales, requestedLocales, options).
        filter_locales::<Self>(requested_locales, options, context).map(JsValue::from)
    }

    /// [`Intl.PluralRules.prototype.resolvedOptions ( )`][spec].
    ///
    /// Returns a new object with properties reflecting the locale and options computed during the
    /// construction of the current `Intl.PluralRules` object.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-intl.pluralrules.prototype.resolvedoptions
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules/resolvedOptions
    fn resolved_options(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let pr be the this value.
        // 2. Perform ? RequireInternalSlot(pr, [[InitializedPluralRules]]).
        let object = this.as_object();
        let plural_rules = object
            .as_ref()
            .and_then(|o| o.downcast_ref::<Self>())
            .ok_or_else(|| {
                JsNativeError::typ().with_message(
                    "`resolved_options` can only be called on an `Intl.PluralRules` object",
                )
            })?;

        // 3. Let options be OrdinaryObjectCreate(%Object.prototype%).
        // 4. Let pluralCategories be a List of Strings containing all possible results of
        //    PluralRuleSelect for the selected locale pr.[[Locale]], sorted according to the following
        //    order: "zero", "one", "two", "few", "many", "other".
        let plural_categories = plural_rules
            .native
            .rules()
            .categories()
            .map(|category| plural_category_to_js_string(category).into());

        // 5. For each row of Table 30, except the header row, in table order, do
        //        a. Let p be the Property value of the current row.
        //        b. If p is "pluralCategories", then
        //               i. Let v be CreateArrayFromList(pluralCategories).
        //        c. Else,
        //               i. Let v be the value of pr's internal slot whose name is the Internal Slot value of the current row.
        //        d. If v is not undefined, then
        //               i. If there is a Conversion value in the current row, then
        //                      1. Assert: The Conversion value of the current row is number.
        //                      2. Set v to 𝔽(v).
        //               ii. Perform ! CreateDataPropertyOrThrow(options, p, v).
        let mut options = ObjectInitializer::new(context);
        options
            .property(
                js_string!("locale"),
                js_string!(plural_rules.locale.to_string()),
                Attribute::all(),
            )
            .property(
                js_string!("type"),
                match plural_rules.rule_type {
                    PluralRuleType::Cardinal => js_string!("cardinal"),
                    PluralRuleType::Ordinal => js_string!("ordinal"),
                    _ => js_string!("unknown"),
                },
                Attribute::all(),
            )
            .property(
                js_string!("notation"),
                plural_rules.notation.to_js_string(),
                Attribute::all(),
            )
            .property(
                js_string!("minimumIntegerDigits"),
                plural_rules.format_options.minimum_integer_digits,
                Attribute::all(),
            );

        if let Some(Extrema { minimum, maximum }) =
            plural_rules.format_options.rounding_type.fraction_digits()
        {
            options
                .property(
                    js_string!("minimumFractionDigits"),
                    minimum,
                    Attribute::all(),
                )
                .property(
                    js_string!("maximumFractionDigits"),
                    maximum,
                    Attribute::all(),
                );
        }

        if let Some(Extrema { minimum, maximum }) = plural_rules
            .format_options
            .rounding_type
            .significant_digits()
        {
            options
                .property(
                    js_string!("minimumSignificantDigits"),
                    minimum,
                    Attribute::all(),
                )
                .property(
                    js_string!("maximumSignificantDigits"),
                    maximum,
                    Attribute::all(),
                );
        }

        let plural_categories = Array::create_array_from_list(plural_categories, options.context());
        options
            .property(
                js_string!("pluralCategories"),
                plural_categories,
                Attribute::all(),
            )
            .property(
                js_string!("roundingIncrement"),
                plural_rules.format_options.rounding_increment.to_u16(),
                Attribute::all(),
            )
            .property(
                js_string!("roundingMode"),
                match plural_rules.format_options.rounding_mode {
                    SignedRoundingMode::Unsigned(UnsignedRoundingMode::Expand) => {
                        js_string!("expand")
                    }
                    SignedRoundingMode::Unsigned(UnsignedRoundingMode::Trunc) => {
                        js_string!("trunc")
                    }
                    SignedRoundingMode::Unsigned(UnsignedRoundingMode::HalfExpand) => {
                        js_string!("halfExpand")
                    }
                    SignedRoundingMode::Unsigned(UnsignedRoundingMode::HalfTrunc) => {
                        js_string!("halfTrunc")
                    }
                    SignedRoundingMode::Unsigned(UnsignedRoundingMode::HalfEven) => {
                        js_string!("halfEven")
                    }
                    SignedRoundingMode::Ceil => js_string!("ceil"),
                    SignedRoundingMode::Floor => js_string!("floor"),
                    SignedRoundingMode::HalfCeil => js_string!("halfCeil"),
                    SignedRoundingMode::HalfFloor => js_string!("halfFloor"),
                    _ => unreachable!("unhandled variant of `SignedRoundingMode`"),
                },
                Attribute::all(),
            )
            .property(
                js_string!("roundingPriority"),
                js_string!(plural_rules.format_options.rounding_priority.to_js_string()),
                Attribute::all(),
            )
            .property(
                js_string!("trailingZeroDisplay"),
                plural_rules
                    .format_options
                    .trailing_zero_display
                    .to_js_string(),
                Attribute::all(),
            );

        // 6. Return options.
        Ok(options.build().into())
    }
}

#[derive(Debug)]
#[allow(unused)] // Will be used when we implement `selectRange`
struct ResolvedPlural {
    category: PluralCategory,
    formatted: Option<Decimal>,
}

/// Abstract operation [`ResolvePlural ( pluralRules, n )`][spec]
///
/// Gets the plural corresponding to the number with the provided formatting options.
///
/// [spec]: https://tc39.es/ecma402/#sec-resolveplural
fn resolve_plural(plural_rules: &PluralRules, n: f64) -> ResolvedPlural {
    // 1. Assert: Type(pluralRules) is Object.
    // 2. Assert: pluralRules has an [[InitializedPluralRules]] internal slot.
    // 3. Assert: Type(n) is Number.
    // 4. If n is not a finite Number, then
    if !n.is_finite() {
        // a. Return "other".
        return ResolvedPlural {
            category: PluralCategory::Other,
            formatted: None,
        };
    }

    // 5. Let locale be pluralRules.[[Locale]].
    // 6. Let type be pluralRules.[[Type]].
    // 7. Let res be ! FormatNumericToString(pluralRules, n).
    let fixed = plural_rules.format_options.format_f64(n);

    // 8. Let s be res.[[FormattedString]].
    // 9. Let operands be ! GetOperands(s).
    // 10. Let p be ! PluralRuleSelect(locale, type, n, operands).

    let category = if let NotationKind::Compact = plural_rules.notation {
        // TODO: Handle scientific and engineering notation once ICU4X adds support:
        // https://github.com/unicode-org/icu4x/issues/3983
        // https://github.com/unicode-org/icu4x/issues/3984

        // get the compact exponent from magnitude
        let exp = (*fixed.magnitude_range().end()).max(0) as u8;
        //instead of using full number, this constructs a compact representation (eg: 1500000 => significand = 1.5, exponent= 6)
        let compact = CompactDecimal::from_significand_and_exponent(fixed.clone(), exp);
        plural_rules.native.rules().category_for(&compact)
    } else {
        plural_rules.native.rules().category_for(&fixed)
    };

    // 11. Return the Record { [[PluralCategory]]: p, [[FormattedString]]: s }.
    ResolvedPlural {
        category,
        formatted: Some(fixed),
    }
}

fn plural_category_to_js_string(category: PluralCategory) -> JsString {
    match category {
        PluralCategory::Zero => js_string!("zero"),
        PluralCategory::One => js_string!("one"),
        PluralCategory::Two => js_string!("two"),
        PluralCategory::Few => js_string!("few"),
        PluralCategory::Many => js_string!("many"),
        PluralCategory::Other => js_string!("other"),
    }
}
