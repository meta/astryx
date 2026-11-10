//! This module implements the global `Intl.DateTimeFormat` object.
//!
//! `Intl.DateTimeFormat` is a built-in object that has properties and methods for date and time i18n.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!
//! [spec]: https://tc39.es/ecma402/#datetimeformat-objects

use crate::{
    Context, JsArgs, JsData, JsExpect, JsResult, JsString, JsValue, NativeFunction,
    builtins::{
        BuiltInBuilder, BuiltInConstructor, BuiltInObject, IntrinsicObject,
        date::utils::{
            date_from_time, hour_from_time, min_from_time, month_from_time, ms_from_time,
            sec_from_time, time_clip, year_from_time,
        },
        intl::{
            Service,
            date_time_format::options::{
                DateStyle, FormatMatcher, FormatOptions, SubsecondDigits, TimeStyle,
            },
            locale::{canonicalize_locale_list, filter_locales, resolve_locale},
            options::{IntlOptions, coerce_options_to_object},
        },
        options::get_option,
    },
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    error::JsNativeError,
    js_error, js_string,
    object::{
        FunctionObjectBuilder, JsFunction, JsObject, ObjectInitializer,
        internal_methods::get_prototype_from_constructor,
    },
    property::{Attribute, PropertyDescriptor},
    realm::Realm,
    string::StaticJsStrings,
};

use boa_gc::{Finalize, Trace};
use icu_calendar::{Iso, preferences::CalendarAlgorithm};
use icu_datetime::{
    DateTimeFormatter, DateTimeFormatterPreferences,
    fieldsets::{
        builder::{DateFields, FieldSetBuilder},
        enums::CompositeFieldSet,
    },
    input::{Date, DateTime, Time, TimeZone, UtcOffset},
    options::{Length, TimePrecision},
    preferences::HourCycle as IcuHourCycle,
};
use icu_decimal::preferences::NumberingSystem;
use icu_decimal::provider::DecimalSymbolsV1;
use icu_locale::{Locale, extensions::unicode::Value};
use icu_time::{
    TimeZoneInfo, ZonedDateTime,
    zone::{IanaParser, models::Base},
};
use timezone_provider::provider::TimeZoneId;

mod options;

#[cfg(all(test, feature = "intl_bundled"))]
mod tests;

#[derive(Debug, Clone)]
pub(crate) enum FormatTimeZone {
    UtcOffset(UtcOffset),
    Identifier((TimeZone, TimeZoneId)),
}

impl FormatTimeZone {
    pub(crate) fn to_time_zone_info(&self) -> TimeZoneInfo<Base> {
        match self {
            Self::Identifier((tz, _)) => tz.without_offset(),
            Self::UtcOffset(utc_offset) => TimeZone::UNKNOWN.with_offset(Some(*utc_offset)),
        }
    }
}

/// JavaScript `Intl.DateTimeFormat` object.
#[derive(Debug, Clone, Trace, Finalize, JsData)]
#[boa_gc(unsafe_empty_trace)] // Safety: No traceable types
#[allow(dead_code)]
pub(crate) struct DateTimeFormat {
    locale: Locale,
    calendar_algorithm: Option<CalendarAlgorithm>, // TODO: Potentially remove ?
    numbering_system: Option<NumberingSystem>,
    hour_cycle: Option<IcuHourCycle>,
    date_style: Option<DateStyle>,
    time_style: Option<TimeStyle>,
    fractional_second_digits: Option<SubsecondDigits>,
    time_zone: FormatTimeZone,
    fieldset: CompositeFieldSet,
    formatter: DateTimeFormatter<CompositeFieldSet>,
    bound_format: Option<JsFunction>,
    resolved_options: Option<JsObject>,
}

impl Service for DateTimeFormat {
    type LangMarker = DecimalSymbolsV1;

    type Preferences = DateTimeFormatterPreferences;
}

impl IntrinsicObject for DateTimeFormat {
    fn init(realm: &Realm) {
        use crate::JsSymbol;
        let get_format = BuiltInBuilder::callable(realm, Self::get_format)
            .name(js_string!("get format"))
            .build();

        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .static_method(
                Self::supported_locales_of,
                js_string!("supportedLocalesOf"),
                1,
            )
            .accessor(
                js_string!("format"),
                Some(get_format),
                None,
                Attribute::CONFIGURABLE,
            )
            .method(Self::resolved_options, js_string!("resolvedOptions"), 0)
            .property(
                JsSymbol::to_string_tag(),
                js_string!("Intl.DateTimeFormat"),
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInObject for DateTimeFormat {
    const NAME: JsString = StaticJsStrings::DATE_TIME_FORMAT;
}

impl BuiltInConstructor for DateTimeFormat {
    const CONSTRUCTOR_ARGUMENTS: usize = 0;
    const PROTOTYPE_STORAGE_SLOTS: usize = 4;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 1;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::date_time_format;
    /// The `Intl.DateTimeFormat` constructor is the `%DateTimeFormat%` intrinsic object and a standard built-in property of the `Intl` object.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#datetimeformat-objects
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // NOTE (nekevss): separate calls to `CreateDateTimeFormat` to avoid clone.
        // 1. If NewTarget is undefined, let newTarget be the active function object, else let newTarget be NewTarget.
        let new_target_inner = &if new_target.is_undefined() {
            context
                .active_function_object()
                .unwrap_or_else(|| {
                    context
                        .intrinsics()
                        .constructors()
                        .date_time_format()
                        .constructor()
                })
                .into()
        } else {
            new_target.clone()
        };
        let locales = args.get_or_undefined(0);
        let options = args.get_or_undefined(1);

        // 2. Let dateTimeFormat be ? CreateDateTimeFormat(newTarget, locales, options, any, date).
        let prototype = get_prototype_from_constructor(
            new_target_inner,
            StandardConstructors::date_time_format,
            context,
        )?;
        let dtf = create_date_time_format(
            locales,
            options,
            FormatType::Any,
            FormatDefaults::Date,
            context,
        )?;
        let date_time_format = JsObject::from_proto_and_data(prototype, dtf);

        // 3. If the implementation supports the normative optional constructor mode of 4.3 Note 1, then
        //     a. Let this be the this value.
        //     b. Return ? ChainDateTimeFormat(dateTimeFormat, NewTarget, this).
        // ChainDateTimeFormat ( dateTimeFormat, newTarget, this )
        // <https://tc39.es/ecma402/#sec-chaindatetimeformat>

        let this = context.vm.stack.get_this(context.vm.frame());
        let Some(this_obj) = this.as_object() else {
            return Ok(date_time_format.into());
        };

        let constructor = context
            .intrinsics()
            .constructors()
            .date_time_format()
            .constructor();

        // 1. If newTarget is undefined and ? OrdinaryHasInstance(%Intl.DateTimeFormat%, this) is true, then
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

            // a. Perform ? DefinePropertyOrThrow(this, %Intl%.[[FallbackSymbol]],
            //    PropertyDescriptor{ [[Value]]: dateTimeFormat, [[Writable]]: false,
            //    [[Enumerable]]: false, [[Configurable]]: false }).
            this_obj.define_property_or_throw(
                fallback_symbol,
                PropertyDescriptor::builder()
                    .value(date_time_format)
                    .writable(false)
                    .enumerable(false)
                    .configurable(false),
                context,
            )?;
            // b. Return this.
            Ok(this)
        } else {
            // 4. Return dateTimeFormat.
            Ok(date_time_format.into())
        }
    }
}

impl DateTimeFormat {
    fn get_format(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let dtf be the this value.
        // 2. If the implementation supports the normative optional constructor mode of 4.3 Note 1, then
        //     a. Set dtf to ? UnwrapDateTimeFormat(dtf).
        // 3. Perform ? RequireInternalSlot(dtf, [[InitializedDateTimeFormat]]).
        let dtf_object = unwrap_date_time_format(this, context)?;
        let dtf_clone = dtf_object.clone();
        let mut dtf = dtf_object.borrow_mut();

        // 4. If dtf.[[BoundFormat]] is undefined, then
        // 5. Return dtf.[[BoundFormat]].
        if let Some(bound_format) = &dtf.data_mut().bound_format.clone() {
            Ok(bound_format.clone().into())
        } else {
            // a. Let F be a new built-in function object as defined in DateTime Format Functions (11.5.4).
            let bound_format = FunctionObjectBuilder::new(
                context.realm(),
                NativeFunction::from_copy_closure_with_captures(
                    |_, args, dtf, context| {
                        // 1. Let dtf be F.[[DateTimeFormat]].
                        // 2. Assert: dtf is an Object and dtf has an [[InitializedDateTimeFormat]] internal slot.
                        let date = args.get_or_undefined(0);
                        // 3. If date is not provided or is undefined, then
                        let x = if date.is_undefined() {
                            // NOTE (nekevss) i64 should be sufficient for a millisecond
                            // representation.
                            // a. Let x be ! Call(%Date.now%, undefined).
                            context.clock().system_time_millis() as f64
                        // 4. Else,
                        } else {
                            // NOTE (nekevss) The i64 covers all MAX_SAFE_INTEGER values.
                            // a. Let x be ? ToNumber(date).
                            date.to_number(context)?
                        };

                        // 5. Return ? FormatDateTime(dtf, x).
                        format_timestamp_with_dtf(dtf.borrow().data(), x, context)
                    },
                    dtf_clone,
                ),
            )
            .length(1)
            .build();

            // b. Set F.[[DateTimeFormat]] to dtf.
            // c. Set dtf.[[BoundFormat]] to F.
            dtf.data_mut().bound_format = Some(bound_format.clone());
            Ok(bound_format.into())
        }
    }

    /// [`Intl.DateTimeFormat.supportedLocalesOf ( locales [ , options ] )`][spec]
    ///
    /// Returns an array containing those of the provided locales that are
    /// supported in date and time formatting without having to fall back to
    /// the runtime's default locale.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-intl.datetimeformat.supportedlocalesof
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/supportedLocalesOf
    fn supported_locales_of(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let locales = args.get_or_undefined(0);
        let options = args.get_or_undefined(1);

        // 1. Let availableLocales be %DateTimeFormat%.[[AvailableLocales]].
        // 2. Let requestedLocales be ? CanonicalizeLocaleList(locales).
        let requested_locales = canonicalize_locale_list(locales, context)?;

        // 3. Return ? FilterLocales(availableLocales, requestedLocales, options).
        filter_locales::<Self>(requested_locales, options, context).map(JsValue::from)
    }

    /// [`Intl.DateTimeFormat.prototype.resolvedOptions ( )`][spec]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-intl.datetimeformat.prototype.resolvedoptions
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/resolvedOptions
    fn resolved_options(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        //This function provides access to the locale and options computed during initialization of the object.

        // 1. Let dtf be the this value.
        // 2. If the implementation supports the normative optional constructor mode of 4.3 Note 1, then
        //       a. Set dtf to ? UnwrapDateTimeFormat(dtf).
        // 3. Perform ? RequireInternalSlot(dtf, [[InitializedDateTimeFormat]]).
        let dtf_object = unwrap_date_time_format(this, context)?;
        if let Some(cached) = dtf_object.borrow().data().resolved_options.clone() {
            return Ok(cached.into());
        }

        // 4. Let options be OrdinaryObjectCreate(%Object.prototype%).
        // 5. For each row of Table 15, except the header row, in table order, do
        //      a. Let p be the Property value of the current row.
        //      b. If there is an Internal Slot value in the current row, then
        //          i. Let v be the value of dtf's internal slot whose name is the Internal Slot value of the current row.
        //      c. Else,
        //          i. Let format be dtf.[[DateTimeFormat]].
        //          ii. If format has a field [[<p>]] and dtf.[[DateStyle]] is undefined and dtf.[[TimeStyle]] is undefined, then
        //              1. Let v be format.[[<p>]].
        //          iii. Else,
        //              1. Let v be undefined.
        //      d. If v is not undefined, then
        //          i. If there is a Conversion value in the current row, then
        //              1. Let conversion be the Conversion value of the current row.
        //              2. If conversion is hour12, then
        //              a. If v is "h11" or "h12", set v to true. Otherwise, set v to false.
        //              3. Else,
        //              a. Assert: conversion is number.
        //              b. Set v to 𝔽(v).
        //          ii. Perform ! CreateDataPropertyOrThrow(options, p, v).
        let result = {
            let dtf = dtf_object.borrow();
            let dtf = dtf.data();

            let mut options = ObjectInitializer::new(context);
            options.property(
                js_string!("locale"),
                js_string!(dtf.locale.to_string()),
                Attribute::all(),
            );

            if let Some(ca) = &dtf.calendar_algorithm {
                options.property(
                    js_string!("calendar"),
                    js_string!(ca.as_str()),
                    Attribute::all(),
                );
            }

            if let Some(nu) = &dtf.numbering_system {
                options.property(
                    js_string!("numberingSystem"),
                    js_string!(nu.as_str()),
                    Attribute::all(),
                );
            }

            let time_zone_str = match &dtf.time_zone {
                FormatTimeZone::UtcOffset(offset) => {
                    let seconds = offset.to_seconds();
                    let hours = seconds / 3600;
                    let minutes = (seconds.abs() % 3600) / 60;
                    format!("{hours:+03}:{minutes:02}")
                }
                FormatTimeZone::Identifier((tz, _id)) => tz.to_string(),
            };
            options.property(
                js_string!("timeZone"),
                js_string!(time_zone_str),
                Attribute::all(),
            );

            if let Some(hc) = &dtf.hour_cycle {
                options.property(
                    js_string!("hourCycle"),
                    js_string!(hc.as_str()),
                    Attribute::all(),
                );
                //h11/h12 -> true, h23/h24 -> false , because its h12 conversion time
                let hour12 = matches!(hc, IcuHourCycle::H11 | IcuHourCycle::H12);
                options.property(js_string!("hour12"), hour12, Attribute::all());
            }

            // Per Table 15, fractionalSecondDigits is only reported when neither
            // dateStyle nor timeStyle is set; the constructor already guarantees this by
            // rejecting explicit component options alongside a style, so the value is
            // `None` whenever a style is present.
            if let Some(fsd) = dtf.fractional_second_digits {
                options.property(
                    js_string!("fractionalSecondDigits"),
                    fsd.digits(),
                    Attribute::all(),
                );
            }

            if let Some(ds) = dtf.date_style {
                let ds_str = match ds {
                    DateStyle::Full => "full",
                    DateStyle::Long => "long",
                    DateStyle::Medium => "medium",
                    DateStyle::Short => "short",
                };
                options.property(
                    js_string!("dateStyle"),
                    js_string!(ds_str),
                    Attribute::all(),
                );
            }

            if let Some(ts) = dtf.time_style {
                let ts_str = match ts {
                    TimeStyle::Full => "full",
                    TimeStyle::Long => "long",
                    TimeStyle::Medium => "medium",
                    TimeStyle::Short => "short",
                };
                options.property(
                    js_string!("timeStyle"),
                    js_string!(ts_str),
                    Attribute::all(),
                );
            }

            options.build()
        };

        // 6. Return options.
        dtf_object.borrow_mut().data_mut().resolved_options = Some(result.clone());
        Ok(result.into())
    }
}

// Represents a ISO8601 ToLocalTime Record
//
// https://tc39.es/ecma402/#sec-datetimeformat-tolocaltime-records
struct ToLocalTime {
    year: i32,
    month: u8,
    day: u8,
    hour: u8,
    minute: u8,
    second: u8,
    subsecond: u32,
}

impl ToLocalTime {
    // NOTE (nekevss): we may need to adjust the below steps.
    //
    // The core problem is how to adopt the spec steps while also
    // acting as a proper intermediate between built-ins and ICU4X.
    /// The below steps are adapted from 11.5.6 and 11.5.12
    pub(crate) fn from_local_epoch_milliseconds(local_millis: f64) -> JsResult<Self> {
        // 11.5.6, 1. Let x be TimeClip(x).
        let x = time_clip(local_millis);
        // 11.5.6, 2. If x is NaN, throw a RangeError exception.
        if x.is_nan() {
            return Err(js_error!(RangeError: "formattable time value cannot be NaN"));
        }
        // NOTE: The switch to BigInt just for the value to be reverted to float
        // during ToLocalTime calculations
        // 11.5.6, 3. Let epochNanoseconds be ℤ(ℝ(x) × 10**6).
        let epoch_nanoseconds = (x * 1_000_000f64) as i128;

        // We convert back to milliseconds: 𝔽(floor(tz / 10**6))
        let t = epoch_nanoseconds.div_euclid(1_000_000) as f64;

        // 11.5.5, Step 12. Return ToLocalTime record values
        // Also see, 11.5.12
        let year = year_from_time(t);
        let month = month_from_time(t);
        let day = date_from_time(t);
        let hour = hour_from_time(t);
        let minute = min_from_time(t);
        let second = sec_from_time(t);
        let ms = u32::from(ms_from_time(t));

        // 11.5.5, Step 15.f.v. If p is "month", set v to v + 1.
        let month = month + 1; // This month is zero based (0-11)

        Ok(Self {
            year,
            month,
            day,
            hour,
            minute,
            second,
            subsecond: ms * 1_000_000,
        })
    }

    pub(crate) fn to_formattable_datetime(&self) -> JsResult<DateTime<Iso>> {
        Ok(DateTime {
            date: Date::try_new_iso(self.year, self.month, self.day)
                .ok()
                .js_expect("TimeClip ensures valid range.")?,
            time: Time::try_new(self.hour, self.minute, self.second, self.subsecond)
                .ok()
                .js_expect("valid values")?,
        })
    }
}

// ==== Abstract Operations ====

/// Creates a [`DateTimeFormat`] struct (internal slots only). The constructor wraps this in a
/// `JsObject` with the correct prototype; Date.prototype.toLocaleString (and friends) use it
/// directly with [`format_timestamp_with_dtf`] without allocating a JS object.
pub(crate) fn create_date_time_format(
    locales: &JsValue,
    options: &JsValue,
    date_time_format_type: FormatType,
    defaults: FormatDefaults,
    context: &mut Context,
) -> JsResult<DateTimeFormat> {
    // NOTE: The below step's code was moved out into constructor to prevent unnecessary JsObject allocation when we create dtf internally
    // (e.g. toLocaleString methods of Date and Temporal objects)
    // 1. Let dateTimeFormat be ? OrdinaryCreateFromConstructor(newTarget, "%Intl.DateTimeFormat.prototype%",
    // « [[InitializedDateTimeFormat]], [[Locale]], [[Calendar]], [[NumberingSystem]], [[TimeZone]],
    // [[HourCycle]], [[DateStyle]], [[TimeStyle]], [[DateTimeFormat]], [[BoundFormat]] »).
    // 2. Let hour12 be undefined. <- TODO
    // 3. Let modifyResolutionOptions be a new Abstract Closure with parameters (options) that captures hour12 and performs the following steps when called:
    //        a. Set hour12 to options.[[hour12]].
    //        b. Remove field [[hour12]] from options.
    //        c. If hour12 is not undefined, set options.[[hc]] to null.
    // 4. Let optionsResolution be ? ResolveOptions(%Intl.DateTimeFormat%, %Intl.DateTimeFormat%.[[LocaleData]],
    // locales, options, « coerce-options », modifyResolutionOptions).
    //
    // NOTE: We inline ResolveOptions here. (Could be worked into an abstract operation util function)
    // ResolveOptions 1. Let requestedLocales be ? CanonicalizeLocaleList(locales).
    let requested_locales = canonicalize_locale_list(locales, context)?;
    // NOTE: skip ResolveOptions 2, which is based on `REQUIRE-OPTIONS` vs `COERCE-OPTIONS`
    // ResolveOptions 3. If specialBehaviours is present and contains coerce-options,
    // set options to ? CoerceOptionsToObject(options). Otherwise, set options to ? GetOptionsObject(options).
    let options = coerce_options_to_object(options, context)?;
    // ResolveOptions 4. Let matcher be ? GetOption(options, "localeMatcher", string, « "lookup", "best fit" », "best fit").
    let matcher = get_option(&options, js_string!("localeMatcher"), context)?.unwrap_or_default();

    // NOTE: We unroll the below const loop in step 6 using the
    // ResolutionOptionDescriptors from the internal slots
    // https://tc39.es/ecma402/#sec-intl.datetimeformat-internal-slots
    let mut preferences = DateTimeFormatterPreferences::default();

    // 6. For each Resolution Option Descriptor desc of constructor.[[ResolutionOptionDescriptors]], do
    // a. If desc has a [[Type]] field, let type be desc.[[Type]]. Otherwise, let type be string.
    // b. If desc has a [[Values]] field, let values be desc.[[Values]]. Otherwise, let values be empty.
    // c. Let value be ? GetOption(options, desc.[[Property]], type, values, undefined).
    // d. If value is not undefined, then
    // i. Set value to ! ToString(value).
    // ii. If value cannot be matched by the type Unicode locale nonterminal, throw a RangeError exception.
    // e. Let key be desc.[[Key]].
    // f. Set opt.[[<key>]] to value.

    // Handle { [[Key]]: "ca", [[Property]]: "calendar" }
    preferences.calendar_algorithm =
        get_option::<Value>(&options, js_string!("calendar"), context)?
            .map(|ca| CalendarAlgorithm::try_from(&ca))
            .transpose()
            .map_err(|_icu4x_error| js_error!(RangeError: "unknown calendar algorithm"))?;

    // { [[Key]]: "nu", [[Property]]: "numberingSystem" }
    preferences.numbering_system =
        get_option::<Value>(&options, js_string!("numberingSystem"), context)?
            .map(NumberingSystem::try_from)
            .transpose()
            .map_err(|_icu4x_error| js_error!(RangeError: "unknown numbering system"))?;

    // { [[Key]]: "hour12", [[Property]]: "hour12", [[Type]]: boolean }
    let hour_12 = get_option::<bool>(&options, js_string!("hour12"), context)?;

    // { [[Key]]: "hc", [[Property]]: "hourCycle", [[Values]]: « "h11", "h12", "h23", "h24" » }
    preferences.hour_cycle =
        get_option::<options::HourCycle>(&options, js_string!("hourCycle"), context)?
            .map(|hc| {
                // Handle steps 3.a-c here
                // c. If hour12 is not undefined, set options.[[hc]] to null.
                if hour_12.is_some() {
                    Ok(None)
                } else {
                    IcuHourCycle::try_from(hc).map(Some)
                }
            })
            .transpose()
            .map_err(|_icu4x_error| js_error!(RangeError: "unknown hour cycle"))?
            .flatten();

    let mut intl_options = IntlOptions {
        matcher,
        preferences,
    };

    // ResolveOptions 8. Let resolution be ResolveLocale(constructor.[[AvailableLocales]], requestedLocales,
    // opt, constructor.[[RelevantExtensionKeys]], localeData).
    let resolved_locale = resolve_locale::<DateTimeFormat>(
        requested_locales,
        &mut intl_options,
        context.intl_provider(),
    )?;

    // TODO: The resolved calendar, numbering system, and hour cycle should come from
    // the ICU4X locale resolution result, not hardcoded defaults. However, ICU4X does
    // not yet expose getters for these computed values on DateTimeFormatter.
    // This means e.g. `new Intl.DateTimeFormat("ar").resolvedOptions().numberingSystem`
    // incorrectly returns "latn" instead of "arab".
    // Tracked at: unicode-org/icu4x#5868
    if intl_options.preferences.calendar_algorithm.is_none() {
        intl_options.preferences.calendar_algorithm = CalendarAlgorithm::try_from(
            &Value::try_from_str("gregory").expect("'gregory' is a valid BCP 47 value"),
        )
        .ok();
    }

    if intl_options.preferences.numbering_system.is_none() {
        intl_options.preferences.numbering_system = NumberingSystem::try_from(
            Value::try_from_str("latn").expect("'latn' is a valid BCP 47 value"),
        )
        .ok();
    }

    if intl_options.preferences.hour_cycle.is_none() {
        intl_options.preferences.hour_cycle = IcuHourCycle::try_from(
            &Value::try_from_str("h12").expect("'h12' is a valid BCP 47 value"),
        )
        .ok();
    }
    // 5. Set options to optionsResolution.[[Options]].
    // 6. Let r be optionsResolution.[[ResolvedLocale]].
    // 7. Set (deferred) dateTimeFormat.[[Locale]] to r.[[Locale]].
    // 8. Let (deferred) resolvedCalendar be r.[[ca]].
    // 9. Set (deferred) dateTimeFormat.[[Calendar]] to resolvedCalendar.
    // 10. Set (deferred) dateTimeFormat.[[NumberingSystem]] to r.[[nu]].
    // 11. Let (deferred) resolvedLocaleData be r.[[LocaleData]].

    // TODO: Handle hour12 and hc
    // 12. If hour12 is true, then
    // a. Let hc be resolvedLocaleData.[[hourCycle12]].
    // 13. Else if hour12 is false, then
    // a. Let hc be resolvedLocaleData.[[hourCycle24]].
    // 14. Else,
    // a. Assert: hour12 is undefined.
    // b. Let hc be r.[[hc]].
    // c. If hc is null, set hc to resolvedLocaleData.[[hourCycle]].

    // 15. Let timeZone be ? Get(options, "timeZone").
    let time_zone = options.get(js_string!("timeZone"), context)?;

    // 16. If timeZone is undefined, then
    let time_zone = if time_zone.is_undefined() {
        // TODO (nekevss): Resolve system time zone
        // a. Set timeZone to SystemTimeZoneIdentifier().
        JsString::from("Etc/UTC")
    // 17. Else,
    } else {
        // a. Set timeZone to ? ToString(timeZone).
        time_zone.to_string(context)?
    };
    // 18. If IsTimeZoneOffsetString(timeZone) is true, then
    let time_zone_string = time_zone.to_std_string_escaped();
    // Note: Should a timezone enum be part of temporal_rs, icu_time, or an ECMA402 wrapper lib
    let time_zone = if let Ok(utc_offset) = UtcOffset::try_from_str(&time_zone_string) {
        //  a. Let parseResult be ParseText(StringToCodePoints(timeZone), UTCOffset).
        //  b. Assert: parseResult is a Parse Node.
        //  c. If parseResult contains more than one MinuteSecond Parse Node, throw a RangeError exception.
        //  d. Let offsetNanoseconds be ParseTimeZoneOffsetString(timeZone).
        //  e. Let offsetMinutes be offsetNanoseconds / (6 × 10**10).
        //  f. Assert: offsetMinutes is an integer.
        //  g. Set timeZone to FormatOffsetTimeZoneIdentifier(offsetMinutes).
        FormatTimeZone::UtcOffset(utc_offset)
    } else {
        // 19. Else,
        //  a. Let timeZoneIdentifierRecord be GetAvailableNamedTimeZoneIdentifier(timeZone).
        //  b. If timeZoneIdentifierRecord is empty, throw a RangeError exception.
        //  c. Set timeZone to timeZoneIdentifierRecord.[[PrimaryIdentifier]].
        let parser =
            IanaParser::try_new_with_buffer_provider(context.intl_provider().erased_provider())
                .map_err(|_| {
                    JsNativeError::error().with_message("Failed to init time zone data provider")
                })?;
        let time_zone = parser.as_borrowed().parse(&time_zone_string);
        let time_zone_id = context
            .timezone_provider()
            .get(time_zone_string.as_bytes())
            .map_err(|_| {
                JsNativeError::range()
                    .with_message(format!("{time_zone_string:#?} was not a valid time zone."))
            })?;
        FormatTimeZone::Identifier((time_zone, time_zone_id))
    };
    // 20. (deferred) Set dateTimeFormat.[[TimeZone]] to timeZone.

    // 21. Let formatOptions be a new Record.
    // 22. Set formatOptions.[[hourCycle]] to hc.
    // 23. Let hasExplicitFormatComponents be false.

    // NOTE (nekevss): Step 24 is adopted in the `FormatOptions`
    // 24. For each row of Table 16, except the header row, in table order, do
    //         a. Let prop be the name given in the Property column of the current row.
    //         b. If prop is "fractionalSecondDigits", then
    //                i. Let value be ? GetNumberOption(options, "fractionalSecondDigits", 1, 3, undefined).
    //         c. Else,
    //                i. Let values be a List whose elements are the strings given in the Values column of the current row.
    //                ii. Let value be ? GetOption(options, prop, string, values, undefined).
    //         d. Set formatOptions.[[<prop>]] to value.
    //         e. If value is not undefined, then
    //                i. Set hasExplicitFormatComponents to true.
    let mut format_options = FormatOptions::try_init(&options, preferences.hour_cycle, context)?;

    // TODO: how should formatMatcher be used?
    // 25. Let formatMatcher be ? GetOption(options, "formatMatcher", string, « "basic", "best fit" », "best fit").
    let format_matcher =
        get_option::<FormatMatcher>(&options, js_string!("formatMatcher"), context)?
            .unwrap_or(FormatMatcher::BestFit);
    // 26. Let dateStyle be ? GetOption(options, "dateStyle", string, « "full", "long", "medium", "short" », undefined).
    let date_style = get_option::<DateStyle>(&options, js_string!("dateStyle"), context)?;
    // 27. Set dateTimeFormat.[[DateStyle]] to dateStyle.
    // 28. Let timeStyle be ? GetOption(options, "timeStyle", string, « "full", "long", "medium", "short" », undefined).
    let time_style = get_option::<TimeStyle>(&options, js_string!("timeStyle"), context)?;
    // 29. (deferred) Set dateTimeFormat.[[TimeStyle]] to timeStyle.
    // 30. If dateStyle is not undefined or timeStyle is not undefined, then
    let fieldset = if date_style.is_some() || time_style.is_some() {
        // a. If hasExplicitFormatComponents is true, then
        if format_options.has_explicit_format_components() {
            // i. Throw a TypeError exception.
            return Err(
                js_error!(TypeError: "cannot have explicit format components when timeStyle or dateStyle is defined"),
            );
        }
        // b. If required is date and timeStyle is not undefined, then
        if date_time_format_type == FormatType::Date && time_style.is_some() {
            // i. Throw a TypeError exception.
            return Err(
                js_error!(TypeError: "timeStyle cannot be defined for a date DateTimeFormat"),
            );
        }
        // c. If required is time and dateStyle is not undefined, then
        if date_time_format_type == FormatType::Time && date_style.is_some() {
            // i. Throw a TypeError exception.
            return Err(
                js_error!(TypeError: "dateStyle cannot be defined for a time DateTimeFormat"),
            );
        }
        // TODO (nekevss): implement d-e
        // TODO (nekevss): Do we have access to the styles?
        // d. Let styles be resolvedLocaleData.[[styles]].[[<resolvedCalendar>]].
        // e. Let bestFormat be DateTimeStyleFormat(dateStyle, timeStyle, styles).
        date_time_style_format(date_style, time_style)?
    // 31. Else,
    } else {
        // a. Let needDefaults be true.
        // b. If required is date or any, then
        // i. For each property name prop of « "weekday", "year", "month", "day" », do
        // 1. Let value be formatOptions.[[<prop>]].
        // 2. If value is not undefined, set needDefaults to false.
        // c. If required is time or any, then
        // i. For each property name prop of « "dayPeriod", "hour", "minute", "second", "fractionalSecondDigits" », do
        // 1. Let value be formatOptions.[[<prop>]].
        // 2. If value is not undefined, set needDefaults to false.
        let needs_defaults = format_options.check_dtf_type(date_time_format_type);
        // d. If needDefaults is true and defaults is either date or all, then
        if needs_defaults && defaults != FormatDefaults::Time {
            // i. For each property name prop of « "year", "month", "day" », do
            // 1. Set formatOptions.[[<prop>]] to "numeric".
            format_options.set_date_defaults();
        }
        // e. If needDefaults is true and defaults is either time or all, then
        if needs_defaults && defaults != FormatDefaults::Date {
            // i. For each property name prop of « "hour", "minute", "second" », do
            // 1. Set formatOptions.[[<prop>]] to "numeric".
            format_options.set_time_defaults();
        }
        // TODO (nekevss): Do we have access to the localized formats via `icu_datetime`. Is there
        // a specific API by which this is accessed.
        //
        // f. Let formats be resolvedLocaleData.[[formats]].[[<resolvedCalendar>]].
        // g. If formatMatcher is "basic", then
        // i. Let bestFormat be BasicFormatMatcher(formatOptions, formats).
        // h. Else,
        // i. Let bestFormat be BestFitFormatMatcher(formatOptions, formats).
        match format_matcher {
            FormatMatcher::Basic | FormatMatcher::BestFit => {
                best_fit_date_time_format(&format_options)?
            }
        }
    };
    // 32. Set dateTimeFormat.[[DateTimeFormat]] to bestFormat.
    // 33. If bestFormat has a field [[hour]], then
    // a. Set dateTimeFormat.[[HourCycle]] to hc.
    // 34. Return dateTimeFormat.
    let formatter = DateTimeFormatter::try_new_with_buffer_provider(
        context.intl_provider().erased_provider(),
        resolved_locale.clone().into(),
        fieldset,
    )
    .map_err(|e| JsNativeError::range().with_message(format!("failed to load formatter: {e}")))?;

    Ok(DateTimeFormat {
        locale: resolved_locale,
        calendar_algorithm: intl_options.preferences.calendar_algorithm,
        numbering_system: intl_options.preferences.numbering_system,
        hour_cycle: intl_options.preferences.hour_cycle,
        date_style,
        time_style,
        fractional_second_digits: format_options.fractional_second_digits(),
        time_zone,
        fieldset,
        formatter,
        bound_format: None,
        resolved_options: None,
    })
}

/// Formats a timestamp (epoch milliseconds) using the given [`DateTimeFormat`] internals.
///
/// It corresponds the logic from [`PartitionDateTimePattern`][11.5.6] and [`ToLocalTime`][11.5.12].
///
/// [11.5.6]: https://tc39.es/ecma402/#sec-partitiondatetimepattern
/// [11.5.12]: https://tc39.es/ecma402/#sec-tolocaltime
///
/// This helper implements:
///
/// 11.5.6 `PartitionDateTimePattern` ( dtf, x )
/// 1. Let x be TimeClip(x).
/// 2. If x is `NaN`, throw a `RangeError` exception.
/// 3. Let epochNanoseconds be ℤ(ℝ(x) × 10^6).
/// 4. Let timeZone be dtf.[[`TimeZone`]].
/// 5. Let offsetNs be GetOffsetNanosecondsFor(timeZone, epochNanoseconds).
/// 6. Let tz be 𝔽(ℝ(x) + ℝ(offsetNs) / 10^6).
///
/// Then calls `ToLocalTime::from_local_epoch_milliseconds` to obtain calendar fields,
/// and formats the resulting `ZonedDateTime` with ICU4X.
pub(crate) fn format_timestamp_with_dtf(
    dtf: &DateTimeFormat,
    timestamp: f64,
    context: &mut Context,
) -> JsResult<JsValue> {
    // PartitionDateTimePattern ( dtf, x ) step 1:
    // 1. Let x be TimeClip(x).
    let x = time_clip(timestamp);

    // PartitionDateTimePattern ( dtf, x ) step 2:
    // 2. If x is `NaN`, throw a `RangeError` exception.
    if x.is_nan() {
        return Err(js_error!(RangeError: "formatted date cannot be NaN"));
    }
    // PartitionDateTimePattern ( dtf, x ) step 3:
    // Let epochNanoseconds be ℤ(ℝ(x) × 10^6).
    let epoch_ns = x as i128 * 1_000_000;

    // PartitionDateTimePattern ( dtf, x ) step 4:
    // Let timeZone be dtf.[[`TimeZone`]].
    let time_zone = &dtf.time_zone;

    // PartitionDateTimePattern ( dtf, x ) step 5:
    // Let offsetNs be GetOffsetNanosecondsFor(timeZone, epochNanoseconds).
    //
    // NOTE: the spec describes the offset in *nanoseconds*. Internally, we obtain/normalize it to
    // seconds (and then milliseconds) for use with `ToLocalTime::from_local_epoch_milliseconds`.
    let time_zone_offset_seconds = match time_zone {
        FormatTimeZone::UtcOffset(offset) => offset.to_seconds(),
        FormatTimeZone::Identifier((_, time_zone_id)) => {
            let offset_seconds = context
                .timezone_provider()
                .transition_nanoseconds_for_utc_epoch_nanoseconds(*time_zone_id, epoch_ns)
                .map_err(
                    |_e| js_error!(RangeError: "unable to determine transition nanoseconds"),
                )?;
            offset_seconds.0 as i32
        }
    };

    // PartitionDateTimePattern ( dtf, x ) step 6:
    // Let tz be 𝔽(ℝ(x) + ℝ(offsetNs) / 10^6).
    let tz = x + f64::from(time_zone_offset_seconds * 1_000);
    let fields = ToLocalTime::from_local_epoch_milliseconds(tz)?;
    let dt = fields.to_formattable_datetime()?;
    let tz_info = time_zone.to_time_zone_info();
    let tz_info_at_time = tz_info.at_date_time(dt);
    let zdt = ZonedDateTime {
        date: dt.date,
        time: dt.time,
        zone: tz_info_at_time,
    };
    let result = dtf.formatter.format(&zdt).to_string();
    Ok(JsString::from(result).into())
}

fn date_time_style_format(
    date_style: Option<DateStyle>,
    time_style: Option<TimeStyle>,
) -> JsResult<CompositeFieldSet> {
    let mut builder = FieldSetBuilder::default();
    builder.length = match date_style {
        Some(DateStyle::Full | DateStyle::Long) => Some(Length::Long),
        Some(DateStyle::Medium) => Some(Length::Medium),
        Some(DateStyle::Short) => Some(Length::Short),
        None => match time_style {
            Some(TimeStyle::Full | TimeStyle::Long) => Some(Length::Long),
            Some(TimeStyle::Medium) => Some(Length::Medium),
            Some(TimeStyle::Short) => Some(Length::Short),
            None => return Err(js_error!(TypeError: "dateStyle or timeStyle must be defined")),
        },
    };
    builder.date_fields = match date_style {
        Some(DateStyle::Full) => Some(DateFields::YMDE),
        Some(DateStyle::Long | DateStyle::Medium | DateStyle::Short) => Some(DateFields::YMD),
        None => None, // NOTE: timeStyle being undefined is checked when setting length
    };
    builder.time_precision = match time_style {
        Some(TimeStyle::Full | TimeStyle::Long | TimeStyle::Medium) => Some(TimePrecision::Second),
        Some(TimeStyle::Short) => Some(TimePrecision::Minute),
        None => None, // NOTE: dateStyle being undefined is checked when setting length
    };
    builder
        .build_composite()
        .map_err(|e| JsNativeError::range().with_message(e.to_string()).into())
}

fn best_fit_date_time_format(format_options: &FormatOptions) -> JsResult<CompositeFieldSet> {
    let mut builder = FieldSetBuilder::default();
    builder.length = format_options.to_length();
    builder.date_fields = format_options.to_date_fields();
    builder.time_precision = format_options.to_time_fields();
    builder.zone_style = format_options.to_zone_style();
    builder
        .build_composite()
        .map_err(|e| JsNativeError::range().with_message(e.to_string()).into())
}

/// Identifies a specific category of date-time components.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum FormatType {
    Date,
    Time,
    Any,
}

/// Identifies which default values to use when none are specified.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum FormatDefaults {
    Date,
    Time,
    All,
}

/// Abstract operation [`UnwrapDateTimeFormat ( dtf )`][spec].
///
/// This also checks that the returned object is a `DateTimeFormat`, which skips the
/// call to `RequireInternalSlot`.
///
/// [spec]: https://tc39.es/ecma402/#sec-unwrapdatetimeformat
fn unwrap_date_time_format(
    dtf: &JsValue,
    context: &mut Context,
) -> JsResult<JsObject<DateTimeFormat>> {
    // 1. If Type(dtf) is not Object, throw a TypeError exception.
    let dtf_o = dtf.as_object().ok_or_else(|| {
        JsNativeError::typ()
            .with_message("value was not an initialized `Intl.DateTimeFormat` object")
    })?;

    if let Ok(dtf) = dtf_o.clone().downcast::<DateTimeFormat>() {
        // 3. Return dtf.
        return Ok(dtf);
    }

    // 2. If dtf does not have an [[InitializedDateTimeFormat]] internal slot and
    //    ? OrdinaryHasInstance(%Intl.DateTimeFormat%, dtf) is true, then
    let constructor = context
        .intrinsics()
        .constructors()
        .date_time_format()
        .constructor();
    if JsValue::ordinary_has_instance(&constructor.into(), dtf, context)? {
        let fallback_symbol = context
            .intrinsics()
            .objects()
            .intl()
            .borrow()
            .data()
            .fallback_symbol();

        //    a. Return ? Get(dtf, %Intl%.[[FallbackSymbol]]).
        if let Some(dtf) = dtf_o
            .get(fallback_symbol, context)?
            .as_object()
            .and_then(|o| o.downcast::<DateTimeFormat>().ok())
        {
            return Ok(dtf);
        }
    }

    Err(JsNativeError::typ()
        .with_message("object was not an initialized `Intl.DateTimeFormat` object")
        .into())
}
