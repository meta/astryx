use std::cell::Cell;

use boa_gc::{Finalize, Trace, custom_trace};
use fixed_decimal::{Decimal, FloatPrecision, SignDisplay};
use icu_decimal::{
    CompactDecimalFormatter, DecimalFormatter, DecimalFormatterPreferences, FormattedDecimal,
    options::{DecimalFormatterOptions, GroupingStrategy},
    preferences::NumberingSystem,
    provider::{DecimalDigitsV1, DecimalSymbolsV1},
};

use icu_locale::{Locale, extensions::unicode::Value};
use icu_provider::{DataMarker, DataMarkerAttributes, DynamicDataProvider, buf::BufferMarker};
use num_bigint::BigInt;
use num_traits::Num;
use writeable::Writeable;

use super::{
    Service,
    locale::{canonicalize_locale_list, filter_locales, resolve_locale},
    options::{IntlOptions, coerce_options_to_object},
};
use crate::{
    Context, JsArgs, JsData, JsNativeError, JsObject, JsResult, JsString, JsSymbol, JsValue,
    NativeFunction,
    builtins::{
        BuiltInConstructor, BuiltInObject, IntrinsicObject, builder::BuiltInBuilder,
        options::get_option,
    },
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    js_string,
    object::{
        FunctionObjectBuilder, JsFunction, ObjectInitializer,
        internal_methods::get_prototype_from_constructor,
    },
    property::{Attribute, PropertyDescriptor},
    realm::Realm,
    string::StaticJsStrings,
    value::PreferredType,
};
use crate::{js_error, value::JsVariant};

mod options;
pub(crate) use options::*;

#[cfg(test)]
mod tests;

pub(crate) enum FormattedNumber<'a, T> {
    Decimal(FormattedDecimal<'a>),
    Compact(T),
}

impl<T: Writeable> Writeable for FormattedNumber<'_, T> {
    fn write_to<W: core::fmt::Write + ?Sized>(&self, sink: &mut W) -> core::fmt::Result {
        match self {
            FormattedNumber::Decimal(d) => d.write_to(sink),
            FormattedNumber::Compact(c) => c.write_to(sink),
        }
    }

    fn write_to_parts<S: writeable::PartsWrite + ?Sized>(&self, sink: &mut S) -> core::fmt::Result {
        match self {
            FormattedNumber::Decimal(d) => d.write_to_parts(sink),
            FormattedNumber::Compact(c) => c.write_to_parts(sink),
        }
    }

    fn writeable_length_hint(&self) -> writeable::LengthHint {
        match self {
            FormattedNumber::Decimal(d) => d.writeable_length_hint(),
            FormattedNumber::Compact(c) => c.writeable_length_hint(),
        }
    }

    fn writeable_borrow(&self) -> Option<&str> {
        match self {
            FormattedNumber::Decimal(d) => d.writeable_borrow(),
            FormattedNumber::Compact(c) => c.writeable_borrow(),
        }
    }

    fn write_to_string(&self) -> std::borrow::Cow<'_, str> {
        match self {
            FormattedNumber::Decimal(d) => d.write_to_string(),
            FormattedNumber::Compact(c) => c.write_to_string(),
        }
    }
}

#[derive(Debug)]
enum Formatter {
    Standard(DecimalFormatter),
    Scientific(DecimalFormatter),
    Engineering(DecimalFormatter),
    Compact {
        inner: CompactDecimalFormatter,
        display: CompactDisplay,
    },
}

impl Formatter {
    fn format<'l>(&'l self, decimal: &'l Decimal) -> FormattedNumber<'l, impl Writeable> {
        match self {
            Formatter::Standard(fmt) | Formatter::Scientific(fmt) | Formatter::Engineering(fmt) => {
                FormattedNumber::Decimal(fmt.format(decimal))
            }
            Formatter::Compact { inner, .. } => FormattedNumber::Compact(inner.format(decimal)),
        }
    }
}

#[derive(Debug, Finalize, JsData)]
// Safety: `NumberFormat` only contains non-traceable types.
pub(crate) struct NumberFormat {
    locale: Locale,
    formatter: Formatter,
    numbering_system: NumberingSystem,
    unit_options: UnitFormatOptions,
    digit_options: DigitFormatOptions,
    use_grouping: GroupingStrategy,
    sign_display: SignDisplay,
    bound_format: Option<JsFunction>,
}

// SAFETY: the implementation correctly traces the only field
// that needs tracing.
unsafe impl Trace for NumberFormat {
    custom_trace!(this, mark, {
        if let Some(f) = &this.bound_format {
            mark(f);
        }
    });
}

impl NumberFormat {
    /// [`FormatNumeric ( numberFormat, x )`][full] and [`FormatNumericToParts ( numberFormat, x )`][parts].
    ///
    /// The returned struct implements `Writable`, allowing to either write the number as a full
    /// string or by parts.
    ///
    /// [full]: https://tc39.es/ecma402/#sec-formatnumber
    /// [parts]: https://tc39.es/ecma402/#sec-formatnumbertoparts
    pub(crate) fn format<'l>(
        &'l self,
        value: &'l mut Decimal,
    ) -> FormattedNumber<'l, impl Writeable> {
        // TODO: Missing support from ICU4X for Percent/Currency/Unit formatting.
        // TODO: Missing support from ICU4X for Scientific/Engineering notation.

        self.digit_options.format_fixed_decimal(value);
        value.apply_sign_display(self.sign_display);

        self.formatter.format(value)
    }
}

impl Service for NumberFormat {
    type LangMarker = DecimalSymbolsV1;

    type Preferences = DecimalFormatterPreferences;
}

impl IntrinsicObject for NumberFormat {
    fn init(realm: &Realm) {
        let get_format = BuiltInBuilder::callable(realm, Self::get_format)
            .name(js_string!("get format"))
            .build();

        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .static_method(
                Self::supported_locales_of,
                js_string!("supportedLocalesOf"),
                1,
            )
            .property(
                JsSymbol::to_string_tag(),
                js_string!("Intl.NumberFormat"),
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("format"),
                Some(get_format),
                None,
                Attribute::CONFIGURABLE,
            )
            .method(Self::resolved_options, js_string!("resolvedOptions"), 0)
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInObject for NumberFormat {
    const NAME: JsString = StaticJsStrings::NUMBER_FORMAT;
}

impl BuiltInConstructor for NumberFormat {
    const CONSTRUCTOR_ARGUMENTS: usize = 0;
    const PROTOTYPE_STORAGE_SLOTS: usize = 4;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 1;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::number_format;

    /// [`Intl.NumberFormat ( [ locales [ , options ] ] )`][spec].
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-intl.numberformat
    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let locales = args.get_or_undefined(0);
        let options = args.get_or_undefined(1);

        // 1. If NewTarget is undefined, let newTarget be the active function object, else let newTarget be NewTarget.
        let new_target_inner = &if new_target.is_undefined() {
            context
                .active_function_object()
                .unwrap_or_else(|| {
                    context
                        .intrinsics()
                        .constructors()
                        .number_format()
                        .constructor()
                })
                .into()
        } else {
            new_target.clone()
        };

        // 2. Let numberFormat be ? OrdinaryCreateFromConstructor(newTarget, "%Intl.NumberFormat.prototype%", « [[InitializedNumberFormat]], [[Locale]], [[DataLocale]], [[NumberingSystem]], [[Style]], [[Unit]], [[UnitDisplay]], [[Currency]], [[CurrencyDisplay]], [[CurrencySign]], [[MinimumIntegerDigits]], [[MinimumFractionDigits]], [[MaximumFractionDigits]], [[MinimumSignificantDigits]], [[MaximumSignificantDigits]], [[RoundingType]], [[Notation]], [[CompactDisplay]], [[UseGrouping]], [[SignDisplay]], [[RoundingIncrement]], [[RoundingMode]], [[ComputedRoundingPriority]], [[TrailingZeroDisplay]], [[BoundFormat]] »).
        let prototype = get_prototype_from_constructor(
            new_target_inner,
            StandardConstructors::number_format,
            context,
        )?;

        let number_format = Self::new(locales, options, context)?;

        let number_format = JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            prototype,
            number_format,
        );

        // 31. Return unused.

        // 4. If the implementation supports the normative optional constructor mode of 4.3 Note 1, then
        //     a. Let this be the this value.
        //     b. Return ? ChainNumberFormat(numberFormat, NewTarget, this).
        // ChainNumberFormat ( numberFormat, newTarget, this )
        // <https://tc39.es/ecma402/#sec-chainnumberformat>

        let this = context.vm.stack.get_this(context.vm.frame());
        let Some(this_obj) = this.as_object() else {
            return Ok(number_format.into());
        };

        let constructor = context
            .intrinsics()
            .constructors()
            .number_format()
            .constructor();

        // 1. If newTarget is undefined and ? OrdinaryHasInstance(%Intl.NumberFormat%, this) is true, then
        if new_target.is_undefined()
            && JsValue::ordinary_has_instance(&constructor.into(), &this, context)?
        {
            let fallback_symbol = context
                .intrinsics()
                .objects()
                .intl()
                .borrow()
                .data()
                .fallback_symbol();

            // a. Perform ? DefinePropertyOrThrow(this, %Intl%.[[FallbackSymbol]], PropertyDescriptor{ [[Value]]: numberFormat, [[Writable]]: false, [[Enumerable]]: false, [[Configurable]]: false }).
            this_obj.define_property_or_throw(
                fallback_symbol,
                PropertyDescriptor::builder()
                    .value(number_format)
                    .writable(false)
                    .enumerable(false)
                    .configurable(false),
                context,
            )?;
            // b. Return this.
            Ok(this)
        } else {
            // 2. Return numberFormat.
            Ok(number_format.into())
        }
    }
}

impl NumberFormat {
    /// Creates a new instance of `NumberFormat`.
    pub(crate) fn new(
        locales: &JsValue,
        options: &JsValue,
        context: &mut Context,
    ) -> JsResult<Self> {
        // 3. Perform ? InitializeNumberFormat(numberFormat, locales, options).

        // `InitializeNumberFormat ( numberFormat, locales, options )`
        // https://tc39.es/ecma402/#sec-initializenumberformat

        // 1. Let requestedLocales be ? CanonicalizeLocaleList(locales).
        let requested_locales = canonicalize_locale_list(locales, context)?;
        // 2. Set options to ? CoerceOptionsToObject(options).
        let options = coerce_options_to_object(options, context)?;

        // 3. Let opt be a new Record.

        // 4. Let matcher be ? GetOption(options, "localeMatcher", string, « "lookup", "best fit" », "best fit").
        // 5. Set opt.[[localeMatcher]] to matcher.
        let matcher =
            get_option(&options, js_string!("localeMatcher"), context)?.unwrap_or_default();

        // 6. Let numberingSystem be ? GetOption(options, "numberingSystem", string, empty, undefined).
        // 7. If numberingSystem is not undefined, then
        //     a. If numberingSystem cannot be matched by the type Unicode locale nonterminal, throw a RangeError exception.
        // 8. Set opt.[[nu]] to numberingSystem.
        let numbering_system =
            get_option::<NumberingSystem>(&options, js_string!("numberingSystem"), context)?;

        let mut intl_options = IntlOptions {
            matcher,
            preferences: {
                let mut prefs = DecimalFormatterPreferences::default();
                prefs.numbering_system = numbering_system;
                prefs
            },
        };

        // 9. Let localeData be %Intl.NumberFormat%.[[LocaleData]].
        // 10. Let r be ResolveLocale(%Intl.NumberFormat%.[[AvailableLocales]], requestedLocales, opt, %Intl.NumberFormat%.[[RelevantExtensionKeys]], localeData).
        let locale = resolve_locale::<Self>(
            requested_locales,
            &mut intl_options,
            context.intl_provider(),
        )?;

        // 11. Set numberFormat.[[Locale]] to r.[[locale]].
        // 12. Set numberFormat.[[DataLocale]] to r.[[dataLocale]].
        // 13. Set numberFormat.[[NumberingSystem]] to r.[[nu]].

        // 14. Perform ? SetNumberFormatUnitOptions(numberFormat, options).
        let unit_options = UnitFormatOptions::from_options(&options, context)?;

        // 15. Let style be numberFormat.[[Style]].
        // 16. If style is "currency", then
        let (min_fractional, max_fractional) = if unit_options.style() == Style::Currency {
            // TODO: Missing support from ICU4X
            // a. Let currency be numberFormat.[[Currency]].
            // b. Let cDigits be CurrencyDigits(currency).
            // c. Let mnfdDefault be cDigits.
            // d. Let mxfdDefault be cDigits.
            return Err(JsNativeError::typ().with_message("unimplemented").into());
        } else {
            // 17. Else,
            (
                // a. Let mnfdDefault be 0.
                0,
                // b. If style is "percent", then
                if unit_options.style() == Style::Percent {
                    // i. Let mxfdDefault be 0.
                    0
                } else {
                    // c. Else,
                    //    i. Let mxfdDefault be 3.
                    3
                },
            )
        };

        // 18. Let notation be ? GetOption(options, "notation", string, « "standard", "scientific", "engineering", "compact" », "standard").
        // 19. Set numberFormat.[[Notation]] to notation.
        let notation = get_option(&options, js_string!("notation"), context)?.unwrap_or_default();

        // 20. Perform ? SetNumberFormatDigitOptions(numberFormat, options, mnfdDefault, mxfdDefault, notation).
        let digit_options = DigitFormatOptions::from_options(
            &options,
            min_fractional,
            max_fractional,
            notation,
            context,
        )?;

        // 21. Let compactDisplay be ? GetOption(options, "compactDisplay", string, « "short", "long" », "short").
        let compact_display =
            get_option(&options, js_string!("compactDisplay"), context)?.unwrap_or_default();

        // 22. Let defaultUseGrouping be "auto".
        // 23. If notation is "compact", then
        //     b. Set defaultUseGrouping to "min2".
        //     a. Set numberFormat.[[CompactDisplay]] to compactDisplay.
        let default_use_grouping = if notation == NotationKind::Compact {
            GroupingStrategy::Min2
        } else {
            GroupingStrategy::Auto
        };

        // 24. NOTE: For historical reasons, the strings "true" and "false" are accepted and replaced with the default value.
        // 25. Let useGrouping be ? GetBooleanOrStringNumberFormatOption(options, "useGrouping",
        //     « "min2", "auto", "always", "true", "false" », defaultUseGrouping).
        // 26. If useGrouping is "true" or useGrouping is "false", set useGrouping to defaultUseGrouping.
        // 27. If useGrouping is true, set useGrouping to "always".
        // 28. Set numberFormat.[[UseGrouping]] to useGrouping.
        // useGrouping requires special handling because of the "true" and "false" exceptions.
        // We could also modify the `OptionType` interface but it complicates it a lot just for
        // a single exception.
        let use_grouping = 'block: {
            // GetBooleanOrStringNumberFormatOption ( options, property, stringValues, fallback )
            // <https://tc39.es/ecma402/#sec-getbooleanorstringnumberformatoption>

            // 1. Let value be ? Get(options, property).
            let value = options.get(js_string!("useGrouping"), context)?;

            // 2. If value is undefined, return fallback.
            if value.is_undefined() {
                break 'block default_use_grouping;
            }
            // 3. If value is true, return true.
            if let Some(true) = value.as_boolean() {
                break 'block GroupingStrategy::Always;
            }

            // 4. If ToBoolean(value) is false, return false.
            if !value.to_boolean() {
                break 'block GroupingStrategy::Never;
            }

            // 5. Set value to ? ToString(value).
            // 6. If stringValues does not contain value, throw a RangeError exception.
            // 7. Return value.
            match value.to_string(context)?.to_std_string_escaped().as_str() {
                "min2" => GroupingStrategy::Min2,
                "auto" => GroupingStrategy::Auto,
                "always" => GroupingStrategy::Always,
                // special handling for historical reasons
                "true" | "false" => default_use_grouping,
                _ => {
                    return Err(JsNativeError::range()
                        .with_message(
                            "expected one of `min2`, `auto`, `always`, `true`, or `false`",
                        )
                        .into());
                }
            }
        };

        // 29. Let signDisplay be ? GetOption(options, "signDisplay", string, « "auto", "never", "always", "exceptZero", "negative" », "auto").
        // 30. Set numberFormat.[[SignDisplay]] to signDisplay.
        let sign_display =
            get_option(&options, js_string!("signDisplay"), context)?.unwrap_or(SignDisplay::Auto);

        let mut options = DecimalFormatterOptions::default();
        options.grouping_strategy = Some(use_grouping);

        let (formatter, numbering_system) = {
            struct RequestInspector<'a> {
                inner: &'a dyn DynamicDataProvider<BufferMarker>,
                nu: Cell<Option<Box<DataMarkerAttributes>>>,
            }
            impl DynamicDataProvider<BufferMarker> for RequestInspector<'_> {
                fn load_data(
                    &self,
                    marker: icu_provider::DataMarkerInfo,
                    req: icu_provider::DataRequest<'_>,
                ) -> Result<icu_provider::DataResponse<BufferMarker>, icu_provider::DataError>
                {
                    if marker.id == DecimalDigitsV1::INFO.id {
                        self.nu.set(Some(req.id.marker_attributes.to_owned()));
                    }
                    self.inner.load_data(marker, req)
                }
            }

            let inspector = RequestInspector {
                inner: context.intl_provider().erased_provider(),
                nu: Cell::new(None),
            };

            let formatter = match (notation, compact_display) {
                // TODO: change when scientific/engineering have their own formatters.
                (NotationKind::Standard, _) => Formatter::Standard(
                    DecimalFormatter::try_new_with_buffer_provider(
                        &inspector,
                        (&locale).into(),
                        options,
                    )
                    .map_err(|err| js_error!(TypeError: "{}", err.to_string()))?,
                ),
                (NotationKind::Scientific, _) => Formatter::Scientific(
                    DecimalFormatter::try_new_with_buffer_provider(
                        &inspector,
                        (&locale).into(),
                        options,
                    )
                    .map_err(|err| js_error!(TypeError: "{}", err.to_string()))?,
                ),
                (NotationKind::Engineering, _) => Formatter::Engineering(
                    DecimalFormatter::try_new_with_buffer_provider(
                        &inspector,
                        (&locale).into(),
                        options,
                    )
                    .map_err(|err| js_error!(TypeError: "{}", err.to_string()))?,
                ),
                (NotationKind::Compact, CompactDisplay::Long) => Formatter::Compact {
                    inner: CompactDecimalFormatter::try_new_long_with_buffer_provider(
                        &inspector,
                        (&locale).into(),
                        options.into(),
                    )
                    .map_err(|err| js_error!(TypeError: "{}", err.to_string()))?,
                    display: CompactDisplay::Long,
                },
                (NotationKind::Compact, CompactDisplay::Short) => Formatter::Compact {
                    inner: CompactDecimalFormatter::try_new_short_with_buffer_provider(
                        &inspector,
                        (&locale).into(),
                        options.into(),
                    )
                    .map_err(|err| js_error!(TypeError: "{}", err.to_string()))?,
                    display: CompactDisplay::Short,
                },
            };

            let nu = (|| {
                let nu = inspector.nu.into_inner()?;
                let nu = Value::try_from_str(&nu).ok()?;
                NumberingSystem::try_from(nu).ok()
            })()
            .ok_or_else(|| {
                js_error!(
                    TypeError: "could not obtain resolved numbering system from Intl provider"
                )
            })?;

            (formatter, nu)
        };

        Ok(NumberFormat {
            locale,
            numbering_system,
            formatter,
            unit_options,
            digit_options,
            use_grouping,
            sign_display,
            bound_format: None,
        })
    }

    /// [`Intl.NumberFormat.supportedLocalesOf ( locales [ , options ] )`][spec].
    ///
    /// Returns an array containing those of the provided locales that are supported in number format
    /// without having to fall back to the runtime's default locale.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-intl.numberformat.supportedlocalesof
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/supportedLocalesOf
    fn supported_locales_of(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let locales = args.get_or_undefined(0);
        let options = args.get_or_undefined(1);

        // 1. Let availableLocales be %Intl.NumberFormat%.[[AvailableLocales]].
        // 2. Let requestedLocales be ? CanonicalizeLocaleList(locales).
        let requested_locales = canonicalize_locale_list(locales, context)?;

        // 3. Return ? FilterLocales(availableLocales, requestedLocales, options).
        filter_locales::<Self>(requested_locales, options, context).map(JsValue::from)
    }

    /// [`get Intl.NumberFormat.prototype.format`][spec].
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-intl.numberformat.prototype.format
    fn get_format(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let nf be the this value.
        // 2. If the implementation supports the normative optional constructor mode of 4.3 Note 1, then
        //     a. Set nf to ? UnwrapNumberFormat(nf).
        // 3. Perform ? RequireInternalSlot(nf, [[InitializedNumberFormat]]).
        let nf = unwrap_number_format(this, context)?;
        let nf_clone = nf.clone();
        let mut nf = nf.borrow_mut();

        let bound_format = if let Some(f) = nf.data_mut().bound_format.clone() {
            f
        } else {
            // 4. If nf.[[BoundFormat]] is undefined, then
            //     a. Let F be a new built-in function object as defined in Number Format Functions (15.5.2).
            //     b. Set F.[[NumberFormat]] to nf.
            //     c. Set nf.[[BoundFormat]] to F.
            let bound_format = FunctionObjectBuilder::new(
                context.realm(),
                // Number Format Functions
                // <https://tc39.es/ecma402/#sec-number-format-functions>
                NativeFunction::from_copy_closure_with_captures(
                    |_, args, nf, context| {
                        // 1. Let nf be F.[[NumberFormat]].
                        // 2. Assert: Type(nf) is Object and nf has an [[InitializedNumberFormat]] internal slot.

                        // 3. If value is not provided, let value be undefined.
                        let value = args.get_or_undefined(0);

                        // 4. Let x be ? ToIntlMathematicalValue(value).
                        let mut x = to_intl_mathematical_value(value, context)?;

                        // 5. Return FormatNumeric(nf, x).
                        Ok(js_string!(nf.borrow().data().format(&mut x).write_to_string()).into())
                    },
                    nf_clone,
                ),
            )
            .length(2)
            .build();

            nf.data_mut().bound_format = Some(bound_format.clone());
            bound_format
        };

        // 5. Return nf.[[BoundFormat]].
        Ok(bound_format.into())
    }

    /// [`Intl.NumberFormat.prototype.resolvedOptions ( )`][spec].
    ///
    /// Returns a new object with properties reflecting the locale and options computed during the
    /// construction of the current `Intl.NumberFormat` object.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-intl.numberformat.prototype.resolvedoptions
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/resolvedOptions
    fn resolved_options(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // This function provides access to the locale and options computed during initialization of the object.

        // 1. Let nf be the this value.
        // 2. If the implementation supports the normative optional constructor mode of 4.3 Note 1, then
        //     a. Set nf to ? UnwrapNumberFormat(nf).
        // 3. Perform ? RequireInternalSlot(nf, [[InitializedNumberFormat]]).
        let nf = unwrap_number_format(this, context)?;
        let nf = nf.borrow();
        let nf = nf.data();

        // 4. Let options be OrdinaryObjectCreate(%Object.prototype%).
        // 5. For each row of Table 12, except the header row, in table order, do
        //     a. Let p be the Property value of the current row.
        //     b. Let v be the value of nf's internal slot whose name is the Internal Slot value of the current row.
        //     c. If v is not undefined, then
        //         i. If there is a Conversion value in the current row, then
        //             1. Assert: The Conversion value of the current row is number.
        //             2. Set v to 𝔽(v).
        //         ii. Perform ! CreateDataPropertyOrThrow(options, p, v).
        let mut options = ObjectInitializer::new(context);
        options.property(
            js_string!("locale"),
            js_string!(nf.locale.to_string()),
            Attribute::all(),
        );
        options.property(
            js_string!("numberingSystem"),
            js_string!(nf.numbering_system.as_str()),
            Attribute::all(),
        );

        options.property(
            js_string!("style"),
            nf.unit_options.style().to_js_string(),
            Attribute::all(),
        );

        match &nf.unit_options {
            UnitFormatOptions::Currency {
                currency,
                display,
                sign,
            } => {
                options.property(
                    js_string!("currency"),
                    currency.to_js_string(),
                    Attribute::all(),
                );
                options.property(
                    js_string!("currencyDisplay"),
                    display.to_js_string(),
                    Attribute::all(),
                );
                options.property(
                    js_string!("currencySign"),
                    sign.to_js_string(),
                    Attribute::all(),
                );
            }
            UnitFormatOptions::Unit { unit, display } => {
                options.property(js_string!("unit"), unit.to_js_string(), Attribute::all());
                options.property(
                    js_string!("unitDisplay"),
                    display.to_js_string(),
                    Attribute::all(),
                );
            }
            UnitFormatOptions::Decimal | UnitFormatOptions::Percent => {}
        }

        options.property(
            js_string!("minimumIntegerDigits"),
            nf.digit_options.minimum_integer_digits,
            Attribute::all(),
        );

        if let Some(Extrema { minimum, maximum }) = nf.digit_options.rounding_type.fraction_digits()
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

        if let Some(Extrema { minimum, maximum }) =
            nf.digit_options.rounding_type.significant_digits()
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

        let use_grouping = match nf.use_grouping {
            GroupingStrategy::Auto => js_string!("auto").into(),
            GroupingStrategy::Never => JsValue::from(false),
            GroupingStrategy::Always => js_string!("always").into(),
            GroupingStrategy::Min2 => js_string!("min2").into(),
            _ => {
                return Err(JsNativeError::typ()
                    .with_message("unsupported useGrouping value")
                    .into());
            }
        };

        options.property(js_string!("useGrouping"), use_grouping, Attribute::all());

        let (notation, compact_display) = match &nf.formatter {
            Formatter::Standard(_) => (NotationKind::Standard, None),
            Formatter::Scientific(_) => (NotationKind::Scientific, None),
            Formatter::Engineering(_) => (NotationKind::Engineering, None),
            Formatter::Compact { display, .. } => (NotationKind::Compact, Some(*display)),
        };

        options.property(
            js_string!("notation"),
            notation.to_js_string(),
            Attribute::all(),
        );

        if let Some(display) = compact_display {
            options.property(
                js_string!("compactDisplay"),
                display.to_js_string(),
                Attribute::all(),
            );
        }

        let sign_display = match nf.sign_display {
            SignDisplay::Auto => js_string!("auto"),
            SignDisplay::Never => js_string!("never"),
            SignDisplay::Always => js_string!("always"),
            SignDisplay::ExceptZero => js_string!("exceptZero"),
            SignDisplay::Negative => js_string!("negative"),
            _ => {
                return Err(JsNativeError::typ()
                    .with_message("unsupported signDisplay value")
                    .into());
            }
        };

        options
            .property(js_string!("signDisplay"), sign_display, Attribute::all())
            .property(
                js_string!("roundingIncrement"),
                nf.digit_options.rounding_increment.to_u16(),
                Attribute::all(),
            )
            .property(
                js_string!("roundingPriority"),
                nf.digit_options.rounding_priority.to_js_string(),
                Attribute::all(),
            )
            .property(
                js_string!("trailingZeroDisplay"),
                nf.digit_options.trailing_zero_display.to_js_string(),
                Attribute::all(),
            );

        // 6. Return options.
        Ok(options.build().into())
    }
}

/// Abstract operation [`UnwrapNumberFormat ( nf )`][spec].
///
/// This also checks that the returned object is a `NumberFormat`, which skips the
/// call to `RequireInternalSlot`.
///
/// [spec]: https://tc39.es/ecma402/#sec-unwrapnumberformat
fn unwrap_number_format(nf: &JsValue, context: &mut Context) -> JsResult<JsObject<NumberFormat>> {
    // 1. If Type(nf) is not Object, throw a TypeError exception.
    let nf_o = nf.as_object().ok_or_else(|| {
        JsNativeError::typ().with_message("value was not an `Intl.NumberFormat` object")
    })?;

    if let Ok(nf) = nf_o.clone().downcast::<NumberFormat>() {
        // 3. Return nf.
        return Ok(nf);
    }

    // 2. If nf does not have an [[InitializedNumberFormat]] internal slot and ? OrdinaryHasInstance(%Intl.NumberFormat%, nf)
    //    is true, then
    let constructor = context
        .intrinsics()
        .constructors()
        .number_format()
        .constructor();
    if JsValue::ordinary_has_instance(&constructor.into(), nf, context)? {
        let fallback_symbol = context
            .intrinsics()
            .objects()
            .intl()
            .borrow()
            .data()
            .fallback_symbol();

        //    a. Return ? Get(nf, %Intl%.[[FallbackSymbol]]).
        if let Some(nf) = nf_o
            .get(fallback_symbol, context)?
            .as_object()
            .and_then(|o| o.downcast::<NumberFormat>().ok())
        {
            return Ok(nf);
        }
    }

    Err(JsNativeError::typ()
        .with_message("object was not an `Intl.NumberFormat` object")
        .into())
}

/// Abstract operation [`ToIntlMathematicalValue ( value )`][spec].
///
/// [spec]: https://tc39.es/ecma402/#sec-tointlmathematicalvalue
pub(crate) fn to_intl_mathematical_value(
    value: &JsValue,
    context: &mut Context,
) -> JsResult<Decimal> {
    // 1. Let primValue be ? ToPrimitive(value, number).
    let prim_value = value.to_primitive(context, PreferredType::Number)?;

    // TODO: Add support in `Decimal` for infinity and NaN, which
    // should remove the returned errors.
    match prim_value.variant() {
        // 2. If Type(primValue) is BigInt, return ℝ(primValue).
        JsVariant::BigInt(bi) => Decimal::try_from_str(&bi.to_string())
            .map_err(|err| JsNativeError::range().with_message(err.to_string()).into()),
        // 3. If Type(primValue) is String, then
        //     a. Let str be primValue.
        JsVariant::String(s) => {
            // 5. Let text be StringToCodePoints(str).
            // 6. Let literal be ParseText(text, StringNumericLiteral).
            // 7. If literal is a List of errors, return not-a-number.
            // 8. Let intlMV be the StringIntlMV of literal.
            // 9. If intlMV is a mathematical value, then
            //     a. Let rounded be RoundMVResult(abs(intlMV)).
            //     b. If rounded is +∞𝔽 and intlMV < 0, return negative-infinity.
            //     c. If rounded is +∞𝔽, return positive-infinity.
            //     d. If rounded is +0𝔽 and intlMV < 0, return negative-zero.
            //     e. If rounded is +0𝔽, return 0.
            js_string_to_fixed_decimal(&s).ok_or_else(|| {
                JsNativeError::syntax()
                    .with_message("could not parse the provided string")
                    .into()
            })
        }
        // 4. Else,
        _ => {
            // a. Let x be ? ToNumber(primValue).
            // b. If x is -0𝔽, return negative-zero.
            // c. Let str be Number::toString(x, 10).
            let x = prim_value.to_number(context)?;

            Decimal::try_from_f64(x, FloatPrecision::RoundTrip)
                .map_err(|err| JsNativeError::range().with_message(err.to_string()).into())
        }
    }
}

/// Abstract operation [`StringToNumber ( str )`][spec], but specialized for the conversion
/// to a `FixedDecimal`.
///
/// [spec]: https://tc39.es/ecma262/#sec-stringtonumber
// TODO: Introduce `Infinity` and `NaN` to `Decimal` to make this operation
// infallible.
pub(crate) fn js_string_to_fixed_decimal(string: &JsString) -> Option<Decimal> {
    // 1. Let text be ! StringToCodePoints(str).
    // 2. Let literal be ParseText(text, StringNumericLiteral).
    let Ok(string) = string.trim().to_std_string() else {
        // 3. If literal is a List of errors, return NaN.
        return None;
    };
    // 4. Return StringNumericValue of literal.
    match string.as_str() {
        "" => return Some(Decimal::from(0)),
        "-Infinity" | "Infinity" | "+Infinity" => return None,
        _ => {}
    }

    let mut s = string.bytes();
    let base = match (s.next(), s.next()) {
        (Some(b'0'), Some(b'b' | b'B')) => Some(2),
        (Some(b'0'), Some(b'o' | b'O')) => Some(8),
        (Some(b'0'), Some(b'x' | b'X')) => Some(16),
        // Make sure that no further variants of "infinity" are parsed.
        (Some(b'i' | b'I'), _) => {
            return None;
        }
        _ => None,
    };

    // Parse numbers that begin with `0b`, `0o` and `0x`.
    let s = if let Some(base) = base {
        let string = &string[2..];
        if string.is_empty() {
            return None;
        }
        let int = BigInt::from_str_radix(string, base).ok()?;

        int.to_string()
    } else {
        string
    };

    Decimal::try_from_str(&s).ok()
}
