//! Boa's implementation of the `Temporal.PlainYearMonth` built-in object.

use std::str::FromStr;

use crate::{
    Context, JsArgs, JsData, JsError, JsNativeError, JsObject, JsResult, JsString, JsSymbol,
    JsValue,
    builtins::{
        BuiltInBuilder, BuiltInConstructor, BuiltInObject, IntrinsicObject,
        options::{get_option, get_options_object},
    },
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    js_string,
    object::internal_methods::get_prototype_from_constructor,
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
    value::IntoOrUndefined,
};
use boa_gc::{Finalize, Trace};

use icu_calendar::AnyCalendarKind;
use temporal_rs::{
    Calendar, Duration, MonthCode, PlainYearMonth as InnerYearMonth, TinyAsciiStr,
    fields::{CalendarFields, YearMonthCalendarFields},
    options::{DisplayCalendar, Overflow},
    partial::PartialYearMonth,
};

use super::{
    DateTimeValues, calendar::get_temporal_calendar_slot_value_with_default, create_temporal_date,
    create_temporal_duration, is_partial_temporal_object, options::get_difference_settings,
    to_temporal_duration,
};

/// The `Temporal.PlainYearMonth` built-in implementation
///
/// More information:
///
/// - [ECMAScript Temporal proposal][spec]
/// - [MDN reference][mdn]
/// - [`temporal_rs` documentation][temporal_rs-docs]
///
/// [spec]: https://tc39.es/proposal-temporal/#sec-temporal-plainyearmonth-objects
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth
/// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainYearMonth.html
#[derive(Debug, Clone, Trace, Finalize, JsData)]
#[boa_gc(unsafe_empty_trace)]
pub struct PlainYearMonth {
    pub(crate) inner: InnerYearMonth,
}

impl PlainYearMonth {
    pub(crate) fn new(inner: InnerYearMonth) -> Self {
        Self { inner }
    }
}

impl BuiltInObject for PlainYearMonth {
    const NAME: JsString = StaticJsStrings::PLAIN_YM_NAME;
}

impl IntrinsicObject for PlainYearMonth {
    fn init(realm: &Realm) {
        let get_calendar_id = BuiltInBuilder::callable(realm, Self::get_calendar_id)
            .name(js_string!("get calendarId"))
            .build();

        let get_era_year = BuiltInBuilder::callable(realm, Self::get_era_year)
            .name(js_string!("get eraYear"))
            .build();

        let get_era = BuiltInBuilder::callable(realm, Self::get_era)
            .name(js_string!("get era"))
            .build();

        let get_year = BuiltInBuilder::callable(realm, Self::get_year)
            .name(js_string!("get year"))
            .build();

        let get_month = BuiltInBuilder::callable(realm, Self::get_month)
            .name(js_string!("get month"))
            .build();

        let get_month_code = BuiltInBuilder::callable(realm, Self::get_month_code)
            .name(js_string!("get monthCode"))
            .build();

        let get_days_in_month = BuiltInBuilder::callable(realm, Self::get_days_in_month)
            .name(js_string!("get daysInMonth"))
            .build();

        let get_days_in_year = BuiltInBuilder::callable(realm, Self::get_days_in_year)
            .name(js_string!("get daysInYear"))
            .build();

        let get_months_in_year = BuiltInBuilder::callable(realm, Self::get_months_in_year)
            .name(js_string!("get monthsInYear"))
            .build();

        let get_in_leap_year = BuiltInBuilder::callable(realm, Self::get_in_leap_year)
            .name(js_string!("get inLeapYear"))
            .build();

        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .property(
                JsSymbol::to_string_tag(),
                StaticJsStrings::PLAIN_YM_TAG,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("calendarId"),
                Some(get_calendar_id),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("era"),
                Some(get_era),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("eraYear"),
                Some(get_era_year),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("year"),
                Some(get_year),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("month"),
                Some(get_month),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("monthCode"),
                Some(get_month_code),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("daysInMonth"),
                Some(get_days_in_month),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("daysInYear"),
                Some(get_days_in_year),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("monthsInYear"),
                Some(get_months_in_year),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("inLeapYear"),
                Some(get_in_leap_year),
                None,
                Attribute::CONFIGURABLE,
            )
            .static_method(Self::from, js_string!("from"), 1)
            .static_method(Self::compare, js_string!("compare"), 2)
            .method(Self::with, js_string!("with"), 1)
            .method(Self::add, js_string!("add"), 1)
            .method(Self::subtract, js_string!("subtract"), 1)
            .method(Self::until, js_string!("until"), 1)
            .method(Self::since, js_string!("since"), 1)
            .method(Self::equals, js_string!("equals"), 1)
            .method(Self::to_string, js_string!("toString"), 0)
            .method(Self::to_locale_string, js_string!("toLocaleString"), 0)
            .method(Self::to_json, js_string!("toJSON"), 0)
            .method(Self::value_of, js_string!("valueOf"), 0)
            .method(Self::to_plain_date, js_string!("toPlainDate"), 1)
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInConstructor for PlainYearMonth {
    const CONSTRUCTOR_ARGUMENTS: usize = 2;
    const PROTOTYPE_STORAGE_SLOTS: usize = 32;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 2;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::plain_year_month;

    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is undefined, then
        if new_target.is_undefined() {
            // a. Throw a TypeError exception.
            return Err(JsNativeError::typ()
                .with_message("NewTarget cannot be undefined when constructing a PlainYearMonth.")
                .into());
        }

        // 2. If referenceISODay is undefined, then
        // a. Set referenceISODay to 1𝔽.
        // 3. Let y be ? ToIntegerWithTruncation(isoYear).
        let y = args
            .get_or_undefined(0)
            .to_finitef64(context)?
            .as_integer_with_truncation::<i32>();

        // 4. Let m be ? ToIntegerWithTruncation(isoMonth).
        let m = args
            .get_or_undefined(1)
            .to_finitef64(context)?
            .as_integer_with_truncation::<u8>();

        // 5. Let calendar be ? ToTemporalCalendarSlotValue(calendarLike, "iso8601").
        let calendar = args
            .get_or_undefined(2)
            .map(|s| {
                s.as_string()
                    .as_ref()
                    .map(JsString::to_std_string_lossy)
                    .ok_or_else(|| JsNativeError::typ().with_message("calendar must be a string."))
            })
            .transpose()?
            .map(|s| Calendar::try_from_utf8(s.as_bytes()))
            .transpose()?
            .unwrap_or_default();

        // 6. Let ref be ? ToIntegerWithTruncation(referenceISODay).
        let ref_day = args
            .get_or_undefined(3)
            .map(|v| {
                let finite = v.to_finitef64(context)?;
                Ok::<u8, JsError>(finite.as_integer_with_truncation::<u8>())
            })
            .transpose()?;

        // 7. Return ? CreateTemporalYearMonth(y, m, calendar, ref, NewTarget).
        let inner = InnerYearMonth::new_with_overflow(y, m, ref_day, calendar, Overflow::Reject)?;

        create_temporal_year_month(inner, Some(new_target), context)
    }
}

// ==== `Temporal.PlainYearMonth` static methods implementation ====

impl PlainYearMonth {
    /// 9.2.2 `Temporal.PlainYearMonth.from ( item [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plainyearmonth.from
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/from
    fn from(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Return ? ToTemporalYearMonth(item, options).
        let item = args.get_or_undefined(0);
        let options = args.get_or_undefined(1);
        let inner = to_temporal_year_month(item, Some(options.clone()), context)?;
        create_temporal_year_month(inner, None, context)
    }

    /// 9.2.3 `Temporal.PlainYearMonth.compare ( one, two )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plainyearmonth.compare
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/compare
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainYearMonth.html#method.compare_iso
    fn compare(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let one = to_temporal_year_month(args.get_or_undefined(0), None, context)?;
        let two = to_temporal_year_month(args.get_or_undefined(1), None, context)?;
        Ok((one.compare_iso(&two) as i8).into())
    }
}

// ==== `PlainYearMonth` accessors implementation ====

impl PlainYearMonth {
    // Helper for retrieving internal fields
    fn get_internal_field(this: &JsValue, field: &DateTimeValues) -> JsResult<JsValue> {
        let object = this.as_object();
        let year_month = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainYearMonth object.")
            })?;
        let inner = &year_month.inner;
        match field {
            DateTimeValues::Year => Ok(inner.year().into()),
            DateTimeValues::Month => Ok(inner.month().into()),
            DateTimeValues::MonthCode => {
                Ok(JsString::from(InnerYearMonth::month_code(inner).as_str()).into())
            }
            _ => unreachable!(),
        }
    }

    /// 9.3.3 get `Temporal.PlainYearMonth.prototype.calendarId`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plainyearmonth.calendarid
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/calendarId
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainYearMonth.html#method.calendar
    fn get_calendar_id(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let obj = this
            .as_object()
            .ok_or_else(|| JsNativeError::typ().with_message("this must be an object."))?;

        let Ok(year_month) = obj.clone().downcast::<Self>() else {
            return Err(JsNativeError::typ()
                .with_message("the this object must be a PlainYearMonth object.")
                .into());
        };

        let calendar = year_month.borrow().data().inner.calendar().clone();
        Ok(js_string!(calendar.identifier()).into())
    }

    /// 9.3.4 get `Temporal.PlainYearMonth.prototype.era`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plainyearmonth.era
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/era
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainYearMonth.html#method.era
    fn get_era(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let year_month = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainYearMonth object.")
            })?;

        Ok(year_month
            .inner
            .era()
            .map(|s| JsString::from(s.as_str()))
            .into_or_undefined())
    }

    /// 9.3.5 get `Temporal.PlainYearMonth.prototype.eraYear`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plainyearmonth.erayear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/eraYear
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainYearMonth.html#method.era_year
    fn get_era_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let year_month = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainYearMonth object.")
            })?;
        Ok(year_month.inner.era_year().into_or_undefined())
    }

    /// 9.3.6 get `Temporal.PlainYearMonth.prototype.year`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plainyearmonth.year
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/year
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainYearMonth.html#method.year
    fn get_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Self::get_internal_field(this, &DateTimeValues::Year)
    }

    /// 9.3.7 get `Temporal.PlainYearMonth.prototype.month`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plainyearmonth.month
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/month
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainYearMonth.html#method.month
    fn get_month(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Self::get_internal_field(this, &DateTimeValues::Month)
    }

    /// 9.3.8 get `Temporal.PlainYearMonth.prototype.monthCode`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plainyearmonth.monthcode
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/monthCode
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainYearMonth.html#method.month_code
    fn get_month_code(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Self::get_internal_field(this, &DateTimeValues::MonthCode)
    }

    /// 9.3.9 get `Temporal.PlainYearMonth.prototype.daysInYear`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plainyearmonth.daysinyear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/daysInYear
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainYearMonth.html#method.days_in_year
    fn get_days_in_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let year_month = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainYearMonth object.")
            })?;
        let inner = &year_month.inner;
        Ok(inner.days_in_year().into())
    }

    /// 9.3.10 get `Temporal.PlainYearMonth.prototype.daysInMonth`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plainyearmonth.daysinmonth
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/daysInMonth
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainYearMonth.html#method.days_in_month
    fn get_days_in_month(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let year_month = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainYearMonth object.")
            })?;
        let inner = &year_month.inner;
        Ok(inner.days_in_month().into())
    }

    /// 9.3.11 get `Temporal.PlainYearMonth.prototype.monthsInYear`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plainyearmonth.monthsinyear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/monthsInYear
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainYearMonth.html#method.months_in_year
    fn get_months_in_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let year_month = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainYearMonth object.")
            })?;
        let inner = &year_month.inner;
        Ok(inner.months_in_year().into())
    }

    /// 9.3.12 get `Temporal.PlainYearMonth.prototype.inLeapYear`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plainyearmonth.inleapyear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/inLeapYear
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainYearMonth.html#method.in_leap_year
    fn get_in_leap_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let year_month = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainYearMonth object.")
            })?;

        Ok(year_month.inner.in_leap_year().into())
    }
}

// ==== `PlainYearMonth` method implementations ====

impl PlainYearMonth {
    /// 9.3.13 `Temporal.PlainYearMonth.prototype.with ( temporalYearMonthLike [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plainyearmonth.with
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/with
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainYearMonth.html#method.with
    fn with(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let yearMonth be the this value.
        // 2. Perform ? RequireInternalSlot(yearMonth, [[InitializedTemporalYearMonth]]).
        let object = this.as_object();
        let year_month = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainYearMonth object.")
            })?;

        // 3. If ? IsPartialTemporalObject(temporalYearMonthLike) is false, throw a TypeError exception.
        let Some(obj) = is_partial_temporal_object(args.get_or_undefined(0), context)? else {
            return Err(JsNativeError::typ()
                .with_message("temporalYearMonthLike was not a partial object")
                .into());
        };
        // 4. Let calendar be yearMonth.[[Calendar]].
        // 5. Let fields be ISODateToFields(calendar, yearMonth.[[ISODate]], year-month).
        // 6. Let partialYearMonth be ? PrepareCalendarFields(calendar, temporalYearMonthLike, « year, month, month-code », « », partial).
        // 7. Set fields to CalendarMergeFields(calendar, fields, partialYearMonth).
        let fields = to_year_month_calendar_fields(&obj, year_month.inner.calendar(), context)?;
        // NOTE: Update temporal_rs to handle this.
        if fields.is_empty() {
            return Err(JsNativeError::typ()
                .with_message("temporalYearMonthLike cannot be an empty object")
                .into());
        }
        // 8. Let resolvedOptions be ? GetOptionsObject(options).
        let resolved_options = get_options_object(args.get_or_undefined(1))?;
        // 9. Let overflow be ? GetTemporalOverflowOption(resolvedOptions).
        let overflow = get_option::<Overflow>(&resolved_options, js_string!("overflow"), context)?
            .unwrap_or_default();
        // 10. Let isoDate be ? CalendarYearMonthFromFields(calendar, fields, overflow).
        let result = year_month.inner.with(fields, Some(overflow))?;
        // 11. Return ! CreateTemporalYearMonth(isoDate, calendar).
        create_temporal_year_month(result, None, context)
    }

    /// 9.3.14 `Temporal.PlainYearMonth.prototype.add ( temporalDurationLike [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plainyearmonth.add
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/add
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainYearMonth.html#method.add
    fn add(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let duration_like = args.get_or_undefined(0);
        let options = get_options_object(args.get_or_undefined(1))?;

        add_or_subtract_duration(true, this, duration_like, &options, context)
    }

    /// 9.3.15 `Temporal.PlainYearMonth.prototype.subtract ( temporalDurationLike [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plainyearmonth.subtract
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/subtract
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainYearMonth.html#method.subtract
    fn subtract(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let duration_like = args.get_or_undefined(0);
        let options = get_options_object(args.get_or_undefined(1))?;

        add_or_subtract_duration(false, this, duration_like, &options, context)
    }

    /// 9.3.16 `Temporal.PlainYearMonth.prototype.until ( other [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plainyearmonth.until
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/until
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainYearMonth.html#method.until
    fn until(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let year_month = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainYearMonth object.")
            })?;

        let other = to_temporal_year_month(args.get_or_undefined(0), None, context)?;

        if year_month.inner.calendar() != other.calendar() {
            return Err(JsNativeError::range()
                .with_message("calendars are not the same.")
                .into());
        }

        let resolved_options = get_options_object(args.get_or_undefined(1))?;
        // TODO: Disallowed units must be rejected in `temporal_rs`.
        let settings = get_difference_settings(&resolved_options, context)?;
        let result = year_month.inner.until(&other, settings)?;
        create_temporal_duration(result, None, context).map(Into::into)
    }

    /// 9.3.17 `Temporal.PlainYearMonth.prototype.since ( other [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plainyearmonth.since
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/since
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainYearMonth.html#method.since
    fn since(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let year_month = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainYearMonth object.")
            })?;

        let other = to_temporal_year_month(args.get_or_undefined(0), None, context)?;

        if year_month.inner.calendar() != other.calendar() {
            return Err(JsNativeError::range()
                .with_message("calendars are not the same.")
                .into());
        }

        let resolved_options = get_options_object(args.get_or_undefined(1))?;
        // TODO: Disallowed units must be rejected in `temporal_rs`.
        let settings = get_difference_settings(&resolved_options, context)?;
        let result = year_month.inner.since(&other, settings)?;
        create_temporal_duration(result, None, context).map(Into::into)
    }

    /// 9.3.18 `Temporal.PlainYearMonth.prototype.equals ( other )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plainyearmonth.equals
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/equals
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainYearMonth.html#impl-PartialEq-for-PlainYearMonth
    fn equals(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let year_month = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainYearMonth object.")
            })?;

        let other = to_temporal_year_month(args.get_or_undefined(0), None, context)?;

        Ok((year_month.inner == other).into())
    }

    /// 9.3.19 `Temporal.PlainYearMonth.prototype.toString ( [ options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plainyearmonth.tostring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/toString
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainYearMonth.html#method.to_ixdtf_string
    fn to_string(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let YearMonth be the this value.
        // 2. Perform ? RequireInternalSlot(yearMonth, [[InitializedTemporalYearMonth]]).
        let object = this.as_object();
        let year_month = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainYearMonth object.")
            })?;

        // 3. Set options to ? NormalizeOptionsObject(options).
        let options = get_options_object(args.get_or_undefined(0))?;
        // 4. Let showCalendar be ? ToShowCalendarOption(options).
        // Get calendarName from the options object
        let show_calendar =
            get_option::<DisplayCalendar>(&options, js_string!("calendarName"), context)?
                .unwrap_or(DisplayCalendar::Auto);

        let ixdtf = year_month.inner.to_ixdtf_string(show_calendar);
        Ok(JsString::from(ixdtf).into())
    }

    /// 9.3.20 `Temporal.PlainYearMonth.prototype.toLocaleString ( [ locales [ , options ] ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plainyearmonth.tolocalestring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/toLocaleString
    pub(crate) fn to_locale_string(
        this: &JsValue,
        _: &[JsValue],
        _: &mut Context,
    ) -> JsResult<JsValue> {
        // TODO: Update for ECMA-402 compliance
        let object = this.as_object();
        let year_month = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainYearMonth object.")
            })?;

        Ok(JsString::from(year_month.inner.to_string()).into())
    }

    /// 9.3.21 `Temporal.PlainYearMonth.prototype.toJSON ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plainyearmonth.tojson
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/toJSON
    pub(crate) fn to_json(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let year_month = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainYearMonth object.")
            })?;

        Ok(JsString::from(year_month.inner.to_string()).into())
    }

    /// 9.3.22 `Temporal.PlainYearMonth.prototype.valueOf ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plainyearmonth.valueof
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/valueOf
    pub(crate) fn value_of(_this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Err(JsNativeError::typ()
            .with_message("`valueOf` not supported by Temporal built-ins. See 'compare', 'equals', or `toString`")
            .into())
    }

    /// 9.3.23 `Temporal.PlainYearMonth.prototype.toPlainDate ( item )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plainyearmonth.toplaindate
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainYearMonth/toPlainDate
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainYearMonth.html#method.to_plain_date
    fn to_plain_date(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let yearMonth be the this value.
        // 2. Perform ? RequireInternalSlot(yearMonth, [[InitializedTemporalYearMonth]]).
        let object = this.as_object();
        let year_month = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainYearMonth object.")
            })?;

        // 3. If item is not an Object, then
        let Some(obj) = args.get_or_undefined(0).as_object() else {
            // a. Throw a TypeError exception.
            return Err(JsNativeError::typ()
                .with_message("toPlainDate item must be an object.")
                .into());
        };
        // 4. Let calendar be yearMonth.[[Calendar]].
        // 5. Let fields be ISODateToFields(calendar, yearMonth.[[ISODate]], year-month).
        // 6. Let inputFields be ? PrepareCalendarFields(calendar, item, « day », « », « »).
        let day = obj
            .get(js_string!("day"), context)?
            .map(|v| {
                let finite = v.to_finitef64(context)?;
                finite
                    .as_positive_integer_with_truncation::<u8>()
                    .map_err(JsError::from)
            })
            .transpose()?;

        let fields = CalendarFields::new().with_optional_day(day);

        // 7. Let mergedFields be CalendarMergeFields(calendar, fields, inputFields).
        // 8. Let isoDate be ? CalendarDateFromFields(calendar, mergedFields, constrain).
        let result = year_month.inner.to_plain_date(Some(fields))?;
        // 9. Return ! CreateTemporalDate(isoDate, calendar).
        create_temporal_date(result, None, context).map(Into::into)
    }
}

// ==== PlainYearMonth Abstract Operations ====

/// 9.5.2 `ToTemporalYearMonth ( item [ , options ] )`
fn to_temporal_year_month(
    value: &JsValue,
    options: Option<JsValue>,
    context: &mut Context,
) -> JsResult<InnerYearMonth> {
    // If options is not present, set options to undefined.
    let options = options.unwrap_or_default();
    // 2. If item is an Object, then
    if let Some(obj) = value.as_object() {
        // a. If item has an [[InitializedTemporalYearMonth]] internal slot, then
        if let Some(ym) = obj.downcast_ref::<PlainYearMonth>() {
            // i. Let resolvedOptions be ? GetOptionsObject(options).
            let resolved_options = get_options_object(&options)?;
            // ii. Perform ? GetTemporalOverflowOption(resolvedOptions).
            let _overflow =
                get_option::<Overflow>(&resolved_options, js_string!("overflow"), context)?
                    .unwrap_or(Overflow::Constrain);
            // iii. Return ! CreateTemporalYearMonth(item.[[ISODate]], item.[[Calendar]]).
            return Ok(ym.inner.clone());
        }
        // b. Let calendar be ? GetTemporalCalendarIdentifierWithISODefault(item).
        // c. Let fields be ? PrepareCalendarFields(calendar, item, « year, month, month-code », «», «»).
        let partial = to_partial_year_month(&obj, context)?;
        // d. Let resolvedOptions be ? GetOptionsObject(options).
        let resolved_options = get_options_object(&options)?;
        // e. Let overflow be ? GetTemporalOverflowOption(resolvedOptions).
        let overflow = get_option::<Overflow>(&resolved_options, js_string!("overflow"), context)?;
        // f. Let isoDate be ? CalendarYearMonthFromFields(calendar, fields, overflow).
        // g. Return ! CreateTemporalYearMonth(isoDate, calendar).
        return Ok(InnerYearMonth::from_partial(partial, overflow)?);
    }

    // 3. If item is not a String, throw a TypeError exception.
    let Some(ym_string) = value.as_string() else {
        return Err(JsNativeError::typ()
            .with_message("toTemporalYearMonth target must be an object or string")
            .into());
    };

    // 4. Let result be ? ParseISODateTime(item, « TemporalYearMonthString »).
    let result = InnerYearMonth::from_str(&ym_string.to_std_string_escaped())?;
    // 5. Let calendar be result.[[Calendar]].
    // 6. If calendar is empty, set calendar to "iso8601".
    // 7. Set calendar to ? CanonicalizeCalendar(calendar).
    // 8. Let resolvedOptions be ? GetOptionsObject(options).
    let resolved_options = get_options_object(&options)?;
    // 9. Perform ? GetTemporalOverflowOption(resolvedOptions).
    let _overflow = get_option::<Overflow>(&resolved_options, js_string!("overflow"), context)?
        .unwrap_or(Overflow::Constrain);

    // 10. Let isoDate be CreateISODateRecord(result.[[Year]], result.[[Month]], result.[[Day]]).
    // 11. If ISOYearMonthWithinLimits(isoDate) is false, throw a RangeError exception.
    // 12. Set result to ISODateToFields(calendar, isoDate, year-month).
    // 13. NOTE: The following operation is called with constrain regardless of the value of overflow, in order for the calendar to store a canonical value in the [[Day]] field of the [[ISODate]] internal slot of the result.
    // 14. Set isoDate to ? CalendarYearMonthFromFields(calendar, result, constrain).
    // 15. Return ! CreateTemporalYearMonth(isoDate, calendar).
    Ok(result)
}

// 9.5.6 `CreateTemporalYearMonth ( isoYear, isoMonth, calendar, referenceISODay [ , newTarget ] )`
pub(crate) fn create_temporal_year_month(
    ym: InnerYearMonth,
    new_target: Option<&JsValue>,
    context: &mut Context,
) -> JsResult<JsValue> {
    // 1. If IsValidISODate(isoYear, isoMonth, referenceISODay) is false, throw a RangeError exception.
    // 2. If ! ISOYearMonthWithinLimits(isoYear, isoMonth) is false, throw a RangeError exception.

    // 3. If newTarget is not present, set newTarget to %Temporal.PlainYearMonth%.
    let new_target = if let Some(target) = new_target {
        target.clone()
    } else {
        context
            .realm()
            .intrinsics()
            .constructors()
            .plain_year_month()
            .constructor()
            .into()
    };

    // 4. Let object be ? OrdinaryCreateFromConstructor(newTarget, "%Temporal.PlainYearMonth.prototype%", « [[InitializedTemporalYearMonth]], [[ISOYear]], [[ISOMonth]], [[ISODay]], [[Calendar]] »).
    let proto = get_prototype_from_constructor(
        &new_target,
        StandardConstructors::plain_year_month,
        context,
    )?;

    // 5. Set object.[[ISOYear]] to isoYear.
    // 6. Set object.[[ISOMonth]] to isoMonth.
    // 7. Set object.[[Calendar]] to calendar.
    // 8. Set object.[[ISODay]] to referenceISODay.

    let obj = JsObject::from_proto_and_data(proto, PlainYearMonth::new(ym));

    // 9. Return object.
    Ok(obj.into())
}

// 9.5.9 AddDurationToOrSubtractDurationFromPlainYearMonth ( operation, yearMonth, temporalDurationLike, options )
fn add_or_subtract_duration(
    is_addition: bool,
    this: &JsValue,
    duration_like: &JsValue,
    options: &JsObject,
    context: &mut Context,
) -> JsResult<JsValue> {
    let duration: Duration = if duration_like.is_object() {
        to_temporal_duration(duration_like, context)?
    } else if let Some(duration_string) = duration_like.as_string() {
        Duration::from_str(duration_string.to_std_string_escaped().as_str())?
    } else {
        return Err(JsNativeError::typ()
            .with_message("cannot handler string durations yet.")
            .into());
    };

    let overflow =
        get_option(options, js_string!("overflow"), context)?.unwrap_or(Overflow::Constrain);

    let object = this.as_object();
    let year_month = object
        .as_ref()
        .and_then(JsObject::downcast_ref::<PlainYearMonth>)
        .ok_or_else(|| {
            JsNativeError::typ().with_message("this value must be a PlainYearMonth object.")
        })?;

    let inner = &year_month.inner;
    let year_month_result = if is_addition {
        inner.add(&duration, overflow)?
    } else {
        inner.subtract(&duration, overflow)?
    };

    create_temporal_year_month(year_month_result, None, context)
}

fn to_partial_year_month(
    partial_object: &JsObject,
    context: &mut Context,
) -> JsResult<PartialYearMonth> {
    // a. Let calendar be ? ToTemporalCalendar(item).
    let calendar = get_temporal_calendar_slot_value_with_default(partial_object, context)?;
    let calendar_fields = to_year_month_calendar_fields(partial_object, &calendar, context)?;
    Ok(PartialYearMonth {
        calendar_fields,
        calendar,
    })
}

pub(crate) fn to_year_month_calendar_fields(
    partial_object: &JsObject,
    calendar: &Calendar,
    context: &mut Context,
) -> JsResult<YearMonthCalendarFields> {
    // TODO: `temporal_rs` needs a `has_era` method
    let has_no_era = calendar.kind() == AnyCalendarKind::Iso
        || calendar.kind() == AnyCalendarKind::Chinese
        || calendar.kind() == AnyCalendarKind::Dangi;
    let (era, era_year) = if has_no_era {
        (None, None)
    } else {
        let era = partial_object
            .get(js_string!("era"), context)?
            .map(|v| {
                let v = v.to_primitive(context, crate::value::PreferredType::String)?;
                let Some(era) = v.as_string() else {
                    return Err(JsError::from(
                        JsNativeError::typ()
                            .with_message("The monthCode field value must be a string."),
                    ));
                };
                // TODO: double check if an invalid monthCode is a range or type error.
                TinyAsciiStr::<19>::try_from_str(&era.to_std_string_escaped())
                    .map_err(|e| JsError::from(JsNativeError::range().with_message(e.to_string())))
            })
            .transpose()?;
        let era_year = partial_object
            .get(js_string!("eraYear"), context)?
            .map(|v| {
                let finite = v.to_finitef64(context)?;
                Ok::<i32, JsError>(finite.as_integer_with_truncation::<i32>())
            })
            .transpose()?;
        (era, era_year)
    };

    let month = partial_object
        .get(js_string!("month"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_positive_integer_with_truncation::<u8>()
                .map_err(JsError::from)
        })
        .transpose()?;
    let month_code = partial_object
        .get(js_string!("monthCode"), context)?
        .map(|v| {
            let v = v.to_primitive(context, crate::value::PreferredType::String)?;
            let Some(month_code) = v.as_string() else {
                return Err(JsNativeError::typ()
                    .with_message("The monthCode field value must be a string.")
                    .into());
            };
            MonthCode::from_str(&month_code.to_std_string_escaped()).map_err(JsError::from)
        })
        .transpose()?;

    let year = partial_object
        .get(js_string!("year"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            Ok::<i32, JsError>(finite.as_integer_with_truncation::<i32>())
        })
        .transpose()?;

    Ok(YearMonthCalendarFields::new()
        .with_era(era)
        .with_era_year(era_year)
        .with_optional_year(year)
        .with_optional_month(month)
        .with_optional_month_code(month_code))
}
