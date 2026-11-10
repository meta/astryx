//! Boa's implementation of the ECMAScript `Temporal.ZonedDateTime` built-in object

use std::str::FromStr;

use crate::{
    Context, JsArgs, JsBigInt, JsData, JsError, JsNativeError, JsObject, JsResult, JsString,
    JsSymbol, JsValue, JsVariant,
    builtins::{
        BuiltInBuilder, BuiltInConstructor, BuiltInObject, IntrinsicObject,
        options::{get_option, get_options_object},
        temporal::{calendar::to_temporal_calendar_identifier, options::get_digits_option},
    },
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    js_string,
    object::internal_methods::get_prototype_from_constructor,
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
    value::{IntoOrUndefined, PreferredType},
};
use boa_gc::{Finalize, Trace};
use cow_utils::CowUtils;
use icu_calendar::AnyCalendarKind;
use temporal_rs::{
    Calendar, MonthCode, TimeZone, TinyAsciiStr, UtcOffset, ZonedDateTime as ZonedDateTimeInner,
    fields::{CalendarFields, ZonedDateTimeFields},
    options::{
        Disambiguation, DisplayCalendar, DisplayOffset, DisplayTimeZone, OffsetDisambiguation,
        Overflow, RoundingIncrement, RoundingMode, RoundingOptions, ToStringRoundingOptions, Unit,
    },
    parsed_intermediates::ParsedZonedDateTime,
    partial::{PartialTime, PartialZonedDateTime},
    provider::TransitionDirection,
};

use super::{
    calendar::get_temporal_calendar_slot_value_with_default,
    create_temporal_date, create_temporal_datetime, create_temporal_duration,
    create_temporal_instant, create_temporal_time, is_partial_temporal_object,
    options::{TemporalUnitGroup, get_difference_settings, get_temporal_unit},
    to_temporal_duration, to_temporal_time,
};

/// The `Temporal.ZonedDateTime` built-in implementation
///
/// More information:
///
/// - [ECMAScript Temporal proposal][spec]
/// - [MDN reference][mdn]
/// - [`temporal_rs` documentation][temporal_rs-docs]
///
/// [spec]: https://tc39.es/proposal-temporal/#sec-temporal-zoneddatetime-objects
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime
/// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html
#[derive(Debug, Clone, Trace, Finalize, JsData)]
#[boa_gc(unsafe_empty_trace)] // Safety: Does not contain any traceable fields.
pub struct ZonedDateTime {
    pub(crate) inner: Box<ZonedDateTimeInner>,
}

impl ZonedDateTime {
    pub(crate) fn new(inner: ZonedDateTimeInner) -> Self {
        Self {
            inner: Box::new(inner),
        }
    }
}

impl BuiltInObject for ZonedDateTime {
    const NAME: JsString = StaticJsStrings::ZONED_DT_NAME;
}

impl IntrinsicObject for ZonedDateTime {
    fn init(realm: &Realm) {
        let get_calendar_id = BuiltInBuilder::callable(realm, Self::get_calendar_id)
            .name(js_string!("get calendarId"))
            .build();

        let get_timezone_id = BuiltInBuilder::callable(realm, Self::get_timezone_id)
            .name(js_string!("get timeZoneId"))
            .build();

        let get_era = BuiltInBuilder::callable(realm, Self::get_era)
            .name(js_string!("get era"))
            .build();

        let get_era_year = BuiltInBuilder::callable(realm, Self::get_era_year)
            .name(js_string!("get eraYear"))
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

        let get_day = BuiltInBuilder::callable(realm, Self::get_day)
            .name(js_string!("get day"))
            .build();

        let get_hour = BuiltInBuilder::callable(realm, Self::get_hour)
            .name(js_string!("get hour"))
            .build();

        let get_minute = BuiltInBuilder::callable(realm, Self::get_minute)
            .name(js_string!("get minute"))
            .build();

        let get_second = BuiltInBuilder::callable(realm, Self::get_second)
            .name(js_string!("get second"))
            .build();

        let get_millisecond = BuiltInBuilder::callable(realm, Self::get_millisecond)
            .name(js_string!("get millisecond"))
            .build();

        let get_microsecond = BuiltInBuilder::callable(realm, Self::get_microsecond)
            .name(js_string!("get microsecond"))
            .build();

        let get_nanosecond = BuiltInBuilder::callable(realm, Self::get_nanosecond)
            .name(js_string!("get nanosecond"))
            .build();

        let get_epoch_milliseconds = BuiltInBuilder::callable(realm, Self::get_epoch_milliseconds)
            .name(js_string!("get epochMilliseconds"))
            .build();

        let get_epoch_nanoseconds = BuiltInBuilder::callable(realm, Self::get_epoch_nanoseconds)
            .name(js_string!("get epochNanoseconds"))
            .build();

        let get_day_of_week = BuiltInBuilder::callable(realm, Self::get_day_of_week)
            .name(js_string!("get dayOfWeek"))
            .build();

        let get_day_of_year = BuiltInBuilder::callable(realm, Self::get_day_of_year)
            .name(js_string!("get dayOfYear"))
            .build();

        let get_week_of_year = BuiltInBuilder::callable(realm, Self::get_week_of_year)
            .name(js_string!("get weekOfYear"))
            .build();

        let get_hours_in_day = BuiltInBuilder::callable(realm, Self::get_hours_in_day)
            .name(js_string!("get daysInWeek"))
            .build();

        let get_year_of_week = BuiltInBuilder::callable(realm, Self::get_year_of_week)
            .name(js_string!("get yearOfWeek"))
            .build();

        let get_days_in_week = BuiltInBuilder::callable(realm, Self::get_days_in_week)
            .name(js_string!("get daysInWeek"))
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

        let get_offset_nanos = BuiltInBuilder::callable(realm, Self::get_offset_nanoseconds)
            .name(js_string!("get offsetNanoseconds"))
            .build();

        let get_offset = BuiltInBuilder::callable(realm, Self::get_offset)
            .name(js_string!("get offset"))
            .build();

        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .property(
                JsSymbol::to_string_tag(),
                StaticJsStrings::ZONED_DT_TAG,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("calendarId"),
                Some(get_calendar_id),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("timeZoneId"),
                Some(get_timezone_id),
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
                js_string!("day"),
                Some(get_day),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("hour"),
                Some(get_hour),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("minute"),
                Some(get_minute),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("second"),
                Some(get_second),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("millisecond"),
                Some(get_millisecond),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("microsecond"),
                Some(get_microsecond),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("nanosecond"),
                Some(get_nanosecond),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("epochMilliseconds"),
                Some(get_epoch_milliseconds),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("epochNanoseconds"),
                Some(get_epoch_nanoseconds),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("dayOfWeek"),
                Some(get_day_of_week),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("dayOfYear"),
                Some(get_day_of_year),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("weekOfYear"),
                Some(get_week_of_year),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("yearOfWeek"),
                Some(get_year_of_week),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("hoursInDay"),
                Some(get_hours_in_day),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("daysInWeek"),
                Some(get_days_in_week),
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
            .accessor(
                js_string!("offsetNanoseconds"),
                Some(get_offset_nanos),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("offset"),
                Some(get_offset),
                None,
                Attribute::CONFIGURABLE,
            )
            .static_method(Self::from, js_string!("from"), 1)
            .static_method(Self::compare, js_string!("compare"), 2)
            .method(Self::with, js_string!("with"), 1)
            .method(Self::with_plain_time, js_string!("withPlainTime"), 0)
            .method(Self::with_timezone, js_string!("withTimeZone"), 1)
            .method(Self::with_calendar, js_string!("withCalendar"), 1)
            .method(Self::add, js_string!("add"), 1)
            .method(Self::subtract, js_string!("subtract"), 1)
            .method(Self::until, js_string!("until"), 1)
            .method(Self::since, js_string!("since"), 1)
            .method(Self::round, js_string!("round"), 1)
            .method(Self::equals, js_string!("equals"), 1)
            .method(Self::to_string, js_string!("toString"), 0)
            .method(Self::to_locale_string, js_string!("toLocaleString"), 0)
            .method(Self::to_json, js_string!("toJSON"), 0)
            .method(Self::value_of, js_string!("valueOf"), 0)
            .method(Self::start_of_day, js_string!("startOfDay"), 0)
            .method(
                Self::get_time_zone_transition,
                js_string!("getTimeZoneTransition"),
                1,
            )
            .method(Self::to_instant, js_string!("toInstant"), 0)
            .method(Self::to_plain_date, js_string!("toPlainDate"), 0)
            .method(Self::to_plain_time, js_string!("toPlainTime"), 0)
            .method(Self::to_plain_date_time, js_string!("toPlainDateTime"), 0)
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInConstructor for ZonedDateTime {
    const CONSTRUCTOR_ARGUMENTS: usize = 2;
    const PROTOTYPE_STORAGE_SLOTS: usize = 77;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 2;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::zoned_date_time;

    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is undefined, then
        if new_target.is_undefined() {
            // a. Throw a TypeError exception.
            return Err(JsNativeError::typ()
                .with_message("NewTarget cannot be undefined.")
                .into());
        }
        //  2. Set epochNanoseconds to ? ToBigInt(epochNanoseconds).
        //  3. If IsValidEpochNanoseconds(epochNanoseconds) is false, throw a RangeError exception.
        let epoch_nanos = args.get_or_undefined(0).to_bigint(context)?;

        //  4. If timeZone is not a String, throw a TypeError exception.
        let Some(timezone_str) = args.get_or_undefined(1).as_string() else {
            return Err(JsNativeError::typ()
                .with_message("timeZone must be a string.")
                .into());
        };

        //  5. Let timeZoneParse be ? ParseTimeZoneIdentifier(timeZone).
        //  6. If timeZoneParse.[[OffsetMinutes]] is empty, then
        // a. Let identifierRecord be GetAvailableNamezdtimeZoneIdentifier(timeZoneParse.[[Name]]).
        // b. If identifierRecord is empty, throw a RangeError exception.
        // c. Set timeZone to identifierRecord.[[Identifier]].
        //  7. Else,
        // a. Set timeZone to FormatOffsetTimeZoneIdentifier(timeZoneParse.[[OffsetMinutes]]).
        let timezone = TimeZone::try_from_identifier_str_with_provider(
            &timezone_str.to_std_string_escaped(),
            context.timezone_provider(),
        )?;

        //  8. If calendar is undefined, set calendar to "iso8601".
        //  9. If calendar is not a String, throw a TypeError exception.
        //  10. Set calendar to ? CanonicalizeCalendar(calendar).
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

        let inner = ZonedDateTimeInner::try_new_with_provider(
            epoch_nanos.to_i128(),
            timezone,
            calendar,
            context.timezone_provider(),
        )?;

        //  11. Return ? CreateTemporalZonedDateTime(epochNanoseconds, timeZone, calendar, NewTarget).
        create_temporal_zoneddatetime(inner, Some(new_target), context).map(Into::into)
    }
}

// ==== `ZonedDateTime` accessor property methods ====

impl ZonedDateTime {
    /// 6.3.3 get `Temporal.ZonedDateTime.prototype.calendarId`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.calendarid
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/calendarId
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.calendar
    fn get_calendar_id(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(JsString::from(zdt.inner.calendar().identifier()).into())
    }

    /// 6.3.4 get `Temporal.ZonedDateTime.prototype.timeZoneId`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.timezoneid
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/timeZoneId
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.timezone
    fn get_timezone_id(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(JsString::from(
            zdt.inner
                .time_zone()
                .identifier_with_provider(context.timezone_provider())?,
        )
        .into())
    }

    /// 6.3.5 get `Temporal.ZonedDateTime.prototype.era`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.era
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/era
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.era
    fn get_era(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        let era = zdt.inner.era();
        Ok(era
            .map(|tinystr| JsString::from(tinystr.cow_to_lowercase()))
            .into_or_undefined())
    }

    /// 6.3.6 get `Temporal.ZonedDateTime.prototype.eraYear`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.erayear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/eraYear
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.era_year
    fn get_era_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(zdt.inner.era_year().into_or_undefined())
    }

    /// 6.3.7 get `Temporal.ZonedDateTime.prototype.year`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.year
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/year
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.year
    fn get_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(zdt.inner.year().into())
    }

    /// 6.3.8 get `Temporal.ZonedDateTime.prototype.month`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.month
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/month
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.month
    fn get_month(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(zdt.inner.month().into())
    }

    /// 6.3.9 get `Temporal.ZonedDateTime.prototype.monthCode`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.monthcode
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/monthCode
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.month_code
    fn get_month_code(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(JsString::from(zdt.inner.month_code().as_str()).into())
    }

    /// 6.3.10 get `Temporal.ZonedDateTime.prototype.day`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.day
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/day
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.day
    fn get_day(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(zdt.inner.day().into())
    }

    /// 6.3.11 get `Temporal.ZonedDateTime.prototype.hour`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.hour
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/hour
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.hour
    fn get_hour(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(zdt.inner.hour().into())
    }

    /// 6.3.12 get `Temporal.ZonedDateTime.prototype.minute`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.minute
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/minute
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.minute
    fn get_minute(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(zdt.inner.minute().into())
    }

    /// 6.3.13 get `Temporal.ZonedDateTime.prototype.second`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.second
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/second
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.second
    fn get_second(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(zdt.inner.second().into())
    }

    /// 6.3.14 get `Temporal.ZonedDateTime.prototype.millisecond`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.millisecond
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/millisecond
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.millisecond
    fn get_millisecond(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(zdt.inner.millisecond().into())
    }

    /// 6.3.15 get `Temporal.ZonedDateTime.prototype.microsecond`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.microsecond
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/microsecond
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.microsecond
    fn get_microsecond(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(zdt.inner.microsecond().into())
    }

    /// 6.3.16 get `Temporal.ZonedDateTime.prototype.nanosecond`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.nanosecond
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/nanosecond
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.nanosecond
    fn get_nanosecond(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(zdt.inner.nanosecond().into())
    }

    /// 6.3.17 get `Temporal.ZonedDateTime.prototype.epochMilliseconds`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.epochmilliseconds
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/epochMilliseconds
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.epoch_milliseconds
    fn get_epoch_milliseconds(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(zdt.inner.epoch_milliseconds().into())
    }

    /// 6.3.18 get `Temporal.ZonedDateTime.prototype.epochNanoseconds`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.epochnanoseconds
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/epochNanoseconds
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.epoch_nanoseconds
    fn get_epoch_nanoseconds(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(JsBigInt::from(zdt.inner.epoch_nanoseconds().as_i128()).into())
    }

    /// 6.3.19 get `Temporal.ZonedDateTime.prototype.dayOfWeek`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.dayofweek
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/dayOfWeek
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.day_of_week
    fn get_day_of_week(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(zdt.inner.day_of_week().into())
    }

    /// 6.3.20 get `Temporal.ZonedDateTime.prototype.dayOfYear`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.dayofyear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/dayOfYear
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.day_of_year
    fn get_day_of_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(zdt.inner.day_of_year().into())
    }

    /// 6.3.21 get `Temporal.ZonedDateTime.prototype.weekOfYear`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.weekofyear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/weekOfYear
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.week_of_year
    fn get_week_of_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(zdt.inner.week_of_year().into_or_undefined())
    }

    /// 6.3.22 get `Temporal.ZonedDateTime.prototype.yearOfWeek`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.yearofweek
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/yearOfWeek
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.year_of_week
    fn get_year_of_week(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(zdt.inner.year_of_week().into_or_undefined())
    }

    /// 6.3.23 get `Temporal.ZonedDateTime.prototype.hoursInDay`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.hoursinday
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/hoursInDay
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.hours_in_day
    fn get_hours_in_day(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(zdt
            .inner
            .hours_in_day_with_provider(context.timezone_provider())?
            .into())
    }

    /// 6.3.24 get `Temporal.ZonedDateTime.prototype.daysInWeek`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.daysinweek
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/daysInWeek
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.days_in_week
    fn get_days_in_week(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(zdt.inner.days_in_week().into())
    }

    /// 6.3.25 get `Temporal.ZonedDateTime.prototype.daysInMonth`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.daysinmonth
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/daysInMonth
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.days_in_month
    fn get_days_in_month(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(zdt.inner.days_in_month().into())
    }

    /// 6.3.26 get `Temporal.ZonedDateTime.prototype.daysInYear`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.daysinyear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/daysInYear
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.days_in_year
    fn get_days_in_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(zdt.inner.days_in_year().into())
    }

    /// 6.3.27 get `Temporal.ZonedDateTime.prototype.monthsInYear`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.monthsinyear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/monthsInYear
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.months_in_year
    fn get_months_in_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(zdt.inner.months_in_year().into())
    }

    /// 6.3.28 get `Temporal.ZonedDateTime.prototype.inLeapYear`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.inleapyear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/inLeapYear
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.in_leap_year
    fn get_in_leap_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(zdt.inner.in_leap_year().into())
    }

    /// 6.3.29 get Temporal.ZonedDateTime.prototype.offsetNanoseconds
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.offsetnanoseconds
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/offsetNanoseconds
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.offset_nanoseconds
    fn get_offset_nanoseconds(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(zdt.inner.offset_nanoseconds().into())
    }

    /// 6.3.30 get Temporal.ZonedDateTime.prototype.offset
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.zoneddatetime.prototype.offset
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/offset
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.offset
    fn get_offset(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        Ok(JsString::from(zdt.inner.offset()).into())
    }
}

// ==== `ZonedDateTime` static methods implementation ====

impl ZonedDateTime {
    /// 6.2.2 `Temporal.ZonedDateTime.from ( item [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.zoneddatetime.from
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/from
    fn from(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Return ? ToTemporalZonedDateTime(item, options).
        let item = args.get_or_undefined(0);
        let options = args.get(1);
        let inner = to_temporal_zoneddatetime(item, options, context)?;
        create_temporal_zoneddatetime(inner, None, context).map(Into::into)
    }

    /// 6.2.3 `Temporal.ZonedDateTime.compare ( one, two )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.zoneddatetime.compare
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/compare
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.compare_instant
    fn compare(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Return ? ToTemporalZonedDateTime(item, options).
        let one = to_temporal_zoneddatetime(args.get_or_undefined(0), None, context)?;
        let two = to_temporal_zoneddatetime(args.get_or_undefined(1), None, context)?;
        Ok((one.compare_instant(&two) as i8).into())
    }
}

// ==== `ZonedDateTime` methods implementation ====

impl ZonedDateTime {
    /// 6.3.31 `Temporal.ZonedDateTime.prototype.with ( temporalZonedDateTimeLike [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.zoneddatetime.prototype.with
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/with
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.with
    fn with(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let zonedDateTime be the this value.
        // 2. Perform ? RequireInternalSlot(zonedDateTime, [[InitializedTemporalZonedDateTime]]).
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;
        // 3. If ? IsPartialTemporalObject(temporalZonedDateTimeLike) is false, throw a TypeError exception.
        let Some(obj) = is_partial_temporal_object(args.get_or_undefined(0), context)? else {
            return Err(JsNativeError::typ()
                .with_message("temporalZonedDateTimeLike was not a partial object")
                .into());
        };
        // 4. Let epochNs be zonedDateTime.[[EpochNanoseconds]].
        // 5. Let timeZone be zonedDateTime.[[TimeZone]].
        // 6. Let calendar be zonedDateTime.[[Calendar]].
        // 7. Let offsetNanoseconds be GetOffsetNanosecondsFor(timeZone, epochNs).
        // 8. Let isoDateTime be GetISODateTimeFor(timeZone, epochNs).
        // 9. Let fields be ISODateToFields(calendar, isoDateTime.[[ISODate]], date).
        // 10. Set fields.[[Hour]] to isoDateTime.[[Time]].[[Hour]].
        // 11. Set fields.[[Minute]] to isoDateTime.[[Time]].[[Minute]].
        // 12. Set fields.[[Second]] to isoDateTime.[[Time]].[[Second]].
        // 13. Set fields.[[Millisecond]] to isoDateTime.[[Time]].[[Millisecond]].
        // 14. Set fields.[[Microsecond]] to isoDateTime.[[Time]].[[Microsecond]].
        // 15. Set fields.[[Nanosecond]] to isoDateTime.[[Time]].[[Nanosecond]].
        // 16. Set fields.[[OffsetString]] to FormatUTCOffsetNanoseconds(offsetNanoseconds).
        // 17. Let partialZonedDateTime be ? PrepareCalendarFields(calendar, temporalZonedDateTimeLike, « year, month, month-code, day », « hour, minute, second, millisecond, microsecond, nanosecond, offset », partial).
        // 18. Set fields to CalendarMergeFields(calendar, fields, partialZonedDateTime).
        let (fields, _) = to_zoned_date_time_fields(
            &obj,
            zdt.inner.calendar(),
            ZdtFieldsType::NoTimeZone,
            context,
        )?;

        // 19. Let resolvedOptions be ? GetOptionsObject(options).
        let resolved_options = get_options_object(args.get_or_undefined(1))?;
        // 20. Let disambiguation be ? GetTemporalDisambiguationOption(resolvedOptions).
        let disambiguation =
            get_option::<Disambiguation>(&resolved_options, js_string!("disambiguation"), context)?;
        // 21. Let offset be ? GetTemporalOffsetOption(resolvedOptions, prefer).
        let offset =
            get_option::<OffsetDisambiguation>(&resolved_options, js_string!("offset"), context)?;
        // 22. Let overflow be ? GetTemporalOverflowOption(resolvedOptions).
        let overflow = get_option::<Overflow>(&resolved_options, js_string!("overflow"), context)?;

        let result = zdt.inner.with_with_provider(
            fields,
            disambiguation,
            offset,
            overflow,
            context.timezone_provider(),
        )?;
        create_temporal_zoneddatetime(result, None, context).map(Into::into)
    }

    /// 6.3.32 `Temporal.ZonedDateTime.prototype.withPlainTime ( [ plainTimeLike ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.zoneddatetime.prototype.withPlainTime
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/withPlainTime
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.with_plain_time
    fn with_plain_time(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        let time = args
            .get_or_undefined(0)
            .map(|v| to_temporal_time(v, None, context))
            .transpose()?;

        let inner = zdt
            .inner
            .with_plain_time_and_provider(time, context.timezone_provider())?;
        create_temporal_zoneddatetime(inner, None, context).map(Into::into)
    }

    /// 6.3.33 `Temporal.ZonedDateTime.prototype.withTimeZone ( timeZoneLike )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.zoneddatetime.prototype.withtimezone
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/withTimeZone
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.with_timezone
    fn with_timezone(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        let timezone = to_temporal_timezone_identifier(args.get_or_undefined(0), context)?;

        let inner = zdt
            .inner
            .with_time_zone_with_provider(timezone, context.timezone_provider())?;
        create_temporal_zoneddatetime(inner, None, context).map(Into::into)
    }

    /// 6.3.34 `Temporal.ZonedDateTime.prototype.withCalendar ( calendarLike )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.zoneddatetime.prototype.withcalendar
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/withCalendar
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.with_calendar
    fn with_calendar(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        let calendar = to_temporal_calendar_identifier(args.get_or_undefined(0))?;

        let inner = zdt.inner.with_calendar(calendar);
        create_temporal_zoneddatetime(inner, None, context).map(Into::into)
    }

    /// 6.3.35 `Temporal.ZonedDateTime.prototype.add ( temporalDurationLike [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.zoneddatetime.prototype.add
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/add
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.add
    fn add(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        let duration = to_temporal_duration(args.get_or_undefined(0), context)?;

        let options = get_options_object(args.get_or_undefined(1))?;
        let overflow = get_option::<Overflow>(&options, js_string!("overflow"), context)?;

        let result =
            zdt.inner
                .add_with_provider(&duration, overflow, context.timezone_provider())?;
        create_temporal_zoneddatetime(result, None, context).map(Into::into)
    }

    /// 6.3.36 `Temporal.ZonedDateTime.prototype.subtract ( temporalDurationLike [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.zoneddatetime.prototype.subtract
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/subtract
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.subtract
    fn subtract(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        let duration = to_temporal_duration(args.get_or_undefined(0), context)?;

        let options = get_options_object(args.get_or_undefined(1))?;
        let overflow = get_option::<Overflow>(&options, js_string!("overflow"), context)?;

        let result =
            zdt.inner
                .subtract_with_provider(&duration, overflow, context.timezone_provider())?;
        create_temporal_zoneddatetime(result, None, context).map(Into::into)
    }

    /// 6.3.37 `Temporal.ZonedDateTime.prototype.until ( other [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.zoneddatetime.prototype.until
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/until
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.until
    fn until(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        let other = to_temporal_zoneddatetime(args.get_or_undefined(0), None, context)?;

        let options = get_options_object(args.get_or_undefined(1))?;
        let settings = get_difference_settings(&options, context)?;

        let result =
            zdt.inner
                .until_with_provider(&other, settings, context.timezone_provider())?;
        create_temporal_duration(result, None, context).map(Into::into)
    }

    /// 6.3.38 `Temporal.ZonedDateTime.prototype.since ( other [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.zoneddatetime.prototype.since
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/since
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.since
    fn since(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        let other = to_temporal_zoneddatetime(args.get_or_undefined(0), None, context)?;

        let options = get_options_object(args.get_or_undefined(1))?;
        let settings = get_difference_settings(&options, context)?;

        let result =
            zdt.inner
                .since_with_provider(&other, settings, context.timezone_provider())?;
        create_temporal_duration(result, None, context).map(Into::into)
    }

    /// 6.3.39 `Temporal.ZonedDateTime.prototype.round ( roundTo )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.zoneddatetime.prototype.round
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/round
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.round
    fn round(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let zonedDateTime be the this value.
        // 2. Perform ? RequireInternalSlot(zonedDateTime, [[InitializedTemporalZonedDateTime]]).
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        // 3. If roundTo is undefined, then
        let round_to_arg = args.get_or_undefined(0);
        if round_to_arg.is_undefined() {
            // a. Throw a TypeError exception.
            return Err(JsNativeError::typ()
                .with_message("roundTo cannot be undefined.")
                .into());
        }
        // 4. If Type(roundTo) is String, then
        let round_to = if let Some(param_string) = round_to_arg.as_string() {
            // a. Let paramString be roundTo.
            let param_string = param_string.clone();
            // b. Set roundTo to OrdinaryObjectCreate(null).
            let new_round_to = JsObject::with_null_proto();
            // c. Perform ! CreateDataPropertyOrThrow(roundTo, "smallestUnit", paramString).
            new_round_to.create_data_property_or_throw(
                js_string!("smallestUnit"),
                param_string,
                context,
            )?;
            new_round_to
        } else {
            // 5. Else,
            // a. Set roundTo to ? GetOptionsObject(roundTo).
            get_options_object(round_to_arg)?
        };

        // 6. NOTE: The following steps read options and perform independent validation
        // in alphabetical order (GetRoundingIncrementOption reads "roundingIncrement"
        // and GetRoundingModeOption reads "roundingMode").
        let mut options = RoundingOptions::default();

        // 7. Let roundingIncrement be ? GetRoundingIncrementOption(roundTo).
        options.increment =
            get_option::<RoundingIncrement>(&round_to, js_string!("roundingIncrement"), context)?;

        // 8. Let roundingMode be ? GetRoundingModeOption(roundTo, half-expand).
        options.rounding_mode =
            get_option::<RoundingMode>(&round_to, js_string!("roundingMode"), context)?;

        // 9. Let smallestUnit be ? GetTemporalUnitValuedOption(roundTo, "smallestUnit", time, required, « day »).
        options.smallest_unit = get_temporal_unit(
            &round_to,
            js_string!("smallestUnit"),
            TemporalUnitGroup::Time,
            Some(vec![Unit::Day]),
            context,
        )?;

        let result = zdt
            .inner
            .round_with_provider(options, context.timezone_provider())?;
        create_temporal_zoneddatetime(result, None, context).map(Into::into)
    }

    /// 6.3.40 `Temporal.ZonedDateTime.prototype.equals ( other )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.zoneddatetime.prototype.equals
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/equals
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#impl-PartialEq-for-ZonedDateTime
    fn equals(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        let other = to_temporal_zoneddatetime(args.get_or_undefined(0), None, context)?;
        Ok(zdt
            .inner
            .equals_with_provider(&other, context.timezone_provider())?
            .into())
    }

    /// 6.3.41 `Temporal.ZonedDateTime.prototype.toString ( [ options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.zoneddatetime.prototype.tostring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/toString
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.to_ixdtf_string
    fn to_string(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        let options = get_options_object(args.get_or_undefined(0))?;

        let show_calendar =
            get_option::<DisplayCalendar>(&options, js_string!("calendarName"), context)?
                .unwrap_or(DisplayCalendar::Auto);
        let precision = get_digits_option(&options, context)?;
        let show_offset = get_option::<DisplayOffset>(&options, js_string!("offset"), context)?
            .unwrap_or(DisplayOffset::Auto);
        let rounding_mode =
            get_option::<RoundingMode>(&options, js_string!("roundingMode"), context)?;
        let smallest_unit = get_option::<Unit>(&options, js_string!("smallestUnit"), context)?;
        // NOTE: There may be an order-of-operations here due to a check on Unit groups and smallest_unit value.
        let display_timezone =
            get_option::<DisplayTimeZone>(&options, js_string!("timeZoneName"), context)?
                .unwrap_or(DisplayTimeZone::Auto);

        let options = ToStringRoundingOptions {
            precision,
            smallest_unit,
            rounding_mode,
        };
        let ixdtf = zdt.inner.to_ixdtf_string_with_provider(
            show_offset,
            display_timezone,
            show_calendar,
            options,
            context.timezone_provider(),
        )?;

        Ok(JsString::from(ixdtf).into())
    }

    /// 6.3.42 `Temporal.ZonedDateTime.prototype.toLocaleString ( [ locales [ , options ] ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.zoneddatetime.prototype.tolocalestring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/toLocaleString
    fn to_locale_string(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // TODO: Update for ECMA-402 compliance
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        let ixdtf = zdt.inner.to_ixdtf_string_with_provider(
            DisplayOffset::Auto,
            DisplayTimeZone::Auto,
            DisplayCalendar::Auto,
            ToStringRoundingOptions::default(),
            context.timezone_provider(),
        )?;

        Ok(JsString::from(ixdtf).into())
    }

    /// 6.3.43 `Temporal.ZonedDateTime.prototype.toJSON ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.zoneddatetime.prototype.tojson
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/toJSON
    fn to_json(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        let ixdtf = zdt.inner.to_ixdtf_string_with_provider(
            DisplayOffset::Auto,
            DisplayTimeZone::Auto,
            DisplayCalendar::Auto,
            ToStringRoundingOptions::default(),
            context.timezone_provider(),
        )?;

        Ok(JsString::from(ixdtf).into())
    }

    /// 6.3.44 `Temporal.ZonedDateTime.prototype.valueOf ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.zoneddatetime.prototype.valueof
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/valueOf
    pub(crate) fn value_of(_this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Err(JsNativeError::typ()
            .with_message("`valueOf` not supported by Temporal built-ins. See 'compare', 'equals', or `toString`")
            .into())
    }

    /// 6.3.45 `Temporal.ZonedDateTime.prototype.startOfDay ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.zoneddatetime.prototype.startofday
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/startOfDay
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.start_of_day
    fn start_of_day(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        let new = zdt
            .inner
            .start_of_day_with_provider(context.timezone_provider())?;
        create_temporal_zoneddatetime(new, None, context).map(Into::into)
    }

    /// 6.3.46 `Temporal.ZonedDateTime.prototype.getTimeZoneTransition ( directionParam )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.zoneddatetime.prototype.gettimezonetransition
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/getTimeZoneTransition
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.get_time_zone_transition_with_provider
    fn get_time_zone_transition(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let zonedDateTime be the this value.
        // 2. Perform ? RequireInternalSlot(zonedDateTime, [[InitializedTemporalZonedDateTime]]).
        // 3. Let timeZone be zonedDateTime.[[TimeZone]].
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        let direction_param = args.get_or_undefined(0);
        // 4. If directionParam is undefined, throw a TypeError exception.
        if direction_param.is_undefined() {
            return Err(JsNativeError::typ()
                .with_message("getTimeZoneTransition directionParam cannot be undefined.")
                .into());
        }
        // 5. If directionParam is a String, then
        let options_obj = if let Some(param_str) = direction_param.as_string() {
            // a. Let paramString be directionParam.
            // b. Set directionParam to OrdinaryObjectCreate(null).
            let obj = JsObject::with_null_proto();
            // c. Perform ! CreateDataPropertyOrThrow(directionParam, "direction", paramString).
            obj.create_data_property_or_throw(
                js_string!("direction"),
                JsValue::from(param_str.clone()),
                context,
            )?;
            obj
        // 6. Else,
        } else {
            // a. Set directionParam to ? GetOptionsObject(directionParam).
            get_options_object(direction_param)?
        };

        // TODO: step 7
        // 7. Let direction be ? GetDirectionOption(directionParam).
        let direction =
            get_option::<TransitionDirection>(&options_obj, js_string!("direction"), context)?
                .ok_or_else(|| {
                    JsNativeError::range().with_message("direction option is required.")
                })?;

        // Step 8-12
        let result = zdt
            .inner
            .get_time_zone_transition_with_provider(direction, context.timezone_provider())?;

        match result {
            Some(zdt) => create_temporal_zoneddatetime(zdt, None, context).map(Into::into),
            None => Ok(JsValue::null()),
        }
    }

    /// 6.3.47 `Temporal.ZonedDateTime.prototype.toInstant ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.zoneddatetime.prototype.toinstant
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/toInstant
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.to_instant
    fn to_instant(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        create_temporal_instant(zdt.inner.to_instant(), None, context)
    }

    /// 6.3.48 `Temporal.ZonedDateTime.prototype.toPlainDate ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.zoneddatetime.prototype.toplaindate
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/toPlainDate
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.to_plain_date
    fn to_plain_date(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        let inner = zdt.inner.to_plain_date();
        create_temporal_date(inner, None, context).map(Into::into)
    }

    /// 6.3.49 `Temporal.ZonedDateTime.prototype.toPlainTime ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.zoneddatetime.prototype.toplaintime
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/toPlainTime
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.to_plain_time
    fn to_plain_time(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        let new = zdt.inner.to_plain_time();
        create_temporal_time(new, None, context).map(Into::into)
    }

    /// 6.3.50 `Temporal.ZonedDateTime.prototype.toPlainDateTime ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.zoneddatetime.prototype.toplaindatetime
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/toPlainDateTime
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.ZonedDateTime.html#method.to_plain_datetime
    fn to_plain_date_time(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let object = this.as_object();
        let zdt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a ZonedDateTime object.")
            })?;

        let new = zdt.inner.to_plain_date_time();
        create_temporal_datetime(new, None, context).map(Into::into)
    }
}

// ==== ZonedDateTime Abstract Operations ====

/// 6.5.3 `CreateTemporalZonedDateTime ( epochNanoseconds, timeZone, calendar [ , newTarget ] )`
pub(crate) fn create_temporal_zoneddatetime(
    inner: ZonedDateTimeInner,
    new_target: Option<&JsValue>,
    context: &mut Context,
) -> JsResult<JsObject> {
    // 1. Assert: IsValidEpochNanoseconds(epochNanoseconds) is true.
    // 2. If newTarget is not present, set newTarget to %Temporal.ZonedDateTime%.
    let new_target = new_target.cloned().unwrap_or(
        context
            .realm()
            .intrinsics()
            .constructors()
            .zoned_date_time()
            .constructor()
            .into(),
    );
    // 3. Let object be ? OrdinaryCreateFromConstructor(newTarget, "%Temporal.ZonedDateTime.prototype%", « [[InitializezdtemporalZonedDateTime]], [[EpochNanoseconds]], [[TimeZone]], [[Calendar]] »).
    let prototype = get_prototype_from_constructor(
        &new_target,
        StandardConstructors::zoned_date_time,
        context,
    )?;
    // 4. Set object.[[EpochNanoseconds]] to epochNanoseconds.
    // 5. Set object.[[TimeZone]] to timeZone.
    // 6. Set object.[[Calendar]] to calendar.
    let obj = JsObject::from_proto_and_data(prototype, ZonedDateTime::new(inner));

    // 7. Return object.
    Ok(obj)
}

/// 6.5.2 `ToTemporalZonedDateTime ( item [ , options ] )`
pub(crate) fn to_temporal_zoneddatetime(
    value: &JsValue,
    options: Option<&JsValue>,
    context: &mut Context,
) -> JsResult<ZonedDateTimeInner> {
    // 1. If options is not present, set options to undefined.
    // 2. Let offsetBehaviour be option.
    // 3. Let matchBehaviour be match-exactly.
    // 4. If item is an Object, then
    match value.variant() {
        JsVariant::Object(object) => {
            // a. If item has an [[InitializedTemporalZonedDateTime]] internal slot, then
            if let Some(zdt) = object.downcast_ref::<ZonedDateTime>() {
                // i. NOTE: The following steps, and similar ones below, read options
                // and perform independent validation in alphabetical order
                // (GetTemporalDisambiguationOption reads "disambiguation", GetTemporalOffsetOption
                // reads "offset", and GetTemporalOverflowOption reads "overflow").
                // ii. Let resolvedOptions be ? GetOptionsObject(options).
                let options = get_options_object(options.unwrap_or(&JsValue::undefined()))?;
                // iii. Perform ? GetTemporalDisambiguationOption(resolvedOptions).
                let _disambiguation =
                    get_option::<Disambiguation>(&options, js_string!("disambiguation"), context)?
                        .unwrap_or(Disambiguation::Compatible);
                // iv. Perform ? GetTemporalOffsetOption(resolvedOptions, reject).
                let _offset_option =
                    get_option::<OffsetDisambiguation>(&options, js_string!("offset"), context)?
                        .unwrap_or(OffsetDisambiguation::Reject);
                // v. Perform ? GetTemporalOverflowOption(resolvedOptions).
                let _overflow = get_option::<Overflow>(&options, js_string!("overflow"), context)?
                    .unwrap_or_default();
                // vi. Return ! CreateTemporalZonedDateTime(item.[[EpochNanoseconds]], item.[[TimeZone]], item.[[Calendar]]).
                return Ok(zdt.inner.as_ref().clone());
            }
            let partial = to_partial_zoneddatetime(&object, context)?;
            // f. If offsetString is unset, the
            // i. Set offsetBehaviour to wall.
            // g. Let resolvedOptions be ? GetOptionsObject(options).
            let options = get_options_object(options.unwrap_or(&JsValue::undefined()))?;
            // h. Let disambiguation be ? GetTemporalDisambiguationOption(resolvedOptions).
            let disambiguation =
                get_option::<Disambiguation>(&options, js_string!("disambiguation"), context)?;
            // i. Let offsetOption be ? GetTemporalOffsetOption(resolvedOptions, reject).
            let offset_option =
                get_option::<OffsetDisambiguation>(&options, js_string!("offset"), context)?;
            // j. Let overflow be ? GetTemporalOverflowOption(resolvedOptions).
            let overflow = get_option::<Overflow>(&options, js_string!("overflow"), context)?;
            // k. Let result be ? InterpretTemporalDateTimeFields(calendar, fields, overflow).
            // l. Let isoDate be result.[[ISODate]].
            // m. Let time be result.[[Time]].
            Ok(ZonedDateTimeInner::from_partial_with_provider(
                partial,
                overflow,
                disambiguation,
                offset_option,
                context.timezone_provider(),
            )?)
        }
        JsVariant::String(zdt_source) => {
            // b. Let result be ? ParseISODateTime(item, « TemporalDateTimeString[+Zoned] »).
            let parsed = ParsedZonedDateTime::from_utf8_with_provider(
                zdt_source.to_std_string_escaped().as_bytes(),
                context.timezone_provider(),
            )?;
            // c. Let annotation be result.[[TimeZone]].[[TimeZoneAnnotation]].
            // d. Assert: annotation is not empty.
            // e. Let timeZone be ? ToTemporalTimeZoneIdentifier(annotation).
            // f. Let offsetString be result.[[TimeZone]].[[OffsetString]].
            // g. If result.[[TimeZone]].[[Z]] is true, then
            // i. Set offsetBehaviour to exact.
            // h. Else if offsetString is empty, then
            // i. Set offsetBehaviour to wall.
            // i. Let calendar be result.[[Calendar]].
            // j. If calendar is empty, set calendar to "iso8601".
            // k. Set calendar to ? CanonicalizeCalendar(calendar).
            // l. Set matchBehaviour to match-minutes.
            // m. Let resolvedOptions be ? GetOptionsObject(options).
            let options = get_options_object(options.unwrap_or(&JsValue::undefined()))?;
            // n. Let disambiguation be ? GetTemporalDisambiguationOption(resolvedOptions).
            let disambiguation =
                get_option::<Disambiguation>(&options, js_string!("disambiguation"), context)?
                    .unwrap_or(Disambiguation::Compatible);
            // o. Let offsetOption be ? GetTemporalOffsetOption(resolvedOptions, reject).
            let offset_option =
                get_option::<OffsetDisambiguation>(&options, js_string!("offset"), context)?
                    .unwrap_or(OffsetDisambiguation::Reject);
            // p. Perform ? GetTemporalOverflowOption(resolvedOptions).
            let _overflow = get_option::<Overflow>(&options, js_string!("overflow"), context)?;
            // q. Let isoDate be CreateISODateRecord(result.[[Year]], result.[[Month]], result.[[Day]]).
            // r. Let time be result.[[Time]].
            // 6. Let offsetNanoseconds be 0.
            // 7. If offsetBehaviour is option, then
            //        a. Set offsetNanoseconds to ! ParseDateTimeUTCOffset(offsetString).
            // 8. Let epochNanoseconds be ? InterpretISODateTimeOffset(isoDate, time, offsetBehaviour, offsetNanoseconds, timeZone, disambiguation, offsetOption, matchBehaviour).
            Ok(ZonedDateTimeInner::from_parsed_with_provider(
                parsed,
                disambiguation,
                offset_option,
                context.timezone_provider(),
            )?)
        }
        // 5. Else,
        // a. If item is not a String, throw a TypeError exception.
        _ => Err(JsNativeError::typ()
            .with_message("Temporal.ZonedDateTime.from only accepts an object or string.")
            .into()),
    }
    // 9. Return ! CreateTemporalZonedDateTime(epochNanoseconds, timeZone, calendar).
}

pub(crate) fn to_temporal_timezone_identifier(
    value: &JsValue,
    context: &mut Context,
) -> JsResult<TimeZone> {
    // 1. If temporalTimeZoneLike is an Object, then
    //    a. If temporalTimeZoneLike has an [[InitializedTemporalZonedDateTime]] internal slot, then
    if let Some(obj) = value.as_object()
        && let Some(zdt) = obj.downcast_ref::<ZonedDateTime>()
    {
        // i. Return temporalTimeZoneLike.[[TimeZone]].
        return Ok(*zdt.inner.time_zone());
    }

    // 2. If temporalTimeZoneLike is not a String, throw a TypeError exception.
    let Some(tz_string) = value.as_string() else {
        return Err(JsNativeError::typ()
            .with_message("timeZone must be a string or Temporal.ZonedDateTime")
            .into());
    };

    // 3. Let parseResult be ? ParseTemporalTimeZoneString(temporalTimeZoneLike).
    // 4. Let offsetMinutes be parseResult.[[OffsetMinutes]].
    // 5. If offsetMinutes is not empty, return FormatOffsetTimeZoneIdentifier(offsetMinutes).
    // 6. Let name be parseResult.[[Name]].
    // 7. Let timeZoneIdentifierRecord be GetAvailableNamedTimeZoneIdentifier(name).
    // 8. If timeZoneIdentifierRecord is empty, throw a RangeError exception.
    // 9. Return timeZoneIdentifierRecord.[[Identifier]].
    let timezone = TimeZone::try_from_str_with_provider(
        &tz_string.to_std_string_escaped(),
        context.timezone_provider(),
    )?;

    Ok(timezone)
}

fn to_offset_string(value: &JsValue, context: &mut Context) -> JsResult<UtcOffset> {
    // 1. Let offset be ? ToPrimitive(argument, string).
    let offset = value.to_primitive(context, PreferredType::String)?;
    // 2. If offset is not a String, throw a TypeError exception.
    let Some(offset_string) = offset.as_string() else {
        return Err(JsNativeError::typ()
            .with_message("offset must be a String.")
            .into());
    };
    // 3. Perform ? ParseDateTimeUTCOffset(offset).
    let result = UtcOffset::from_str(&offset_string.to_std_string_escaped())?;
    // 4. Return offset.
    Ok(result)
}

pub(crate) fn to_partial_zoneddatetime(
    partial_object: &JsObject,
    context: &mut Context,
) -> JsResult<PartialZonedDateTime> {
    // NOTE (nekevss): Why do we have to list out all of the get operations? Well, order of operations Watson!
    // b. Let calendar be ? GetTemporalCalendarIdentifierWithISODefault(item).
    // c. Let fields be ? PrepareCalendarFields(calendar, item, « year, month, month-code, day », « hour, minute, second, millisecond, microsecond, nanosecond, offset, time-zone », « time-zone »).
    let calendar = get_temporal_calendar_slot_value_with_default(partial_object, context)?;
    let (fields, timezone) = to_zoned_date_time_fields(
        partial_object,
        &calendar,
        ZdtFieldsType::TimeZoneRequired,
        context,
    )?;
    Ok(PartialZonedDateTime {
        fields,
        timezone,
        calendar,
    })
}

/// This distinguishes the type of `PrepareCalendarField` call used.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ZdtFieldsType {
    /// Do not call to the `timeZone` property.
    NoTimeZone,
    /// Call to `timeZone`, value can be undefined.
    TimeZoneNotRequired,
    /// Call to `timeZone`, value must exist.
    TimeZoneRequired,
}

pub(crate) fn to_zoned_date_time_fields(
    partial_object: &JsObject,
    calendar: &Calendar,
    zdt_fields_type: ZdtFieldsType,
    context: &mut Context,
) -> JsResult<(ZonedDateTimeFields, Option<TimeZone>)> {
    let day = partial_object
        .get(js_string!("day"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_positive_integer_with_truncation()
                .map_err(JsError::from)
        })
        .transpose()?;
    let hour = partial_object
        .get(js_string!("hour"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            Ok::<u8, JsError>(finite.as_integer_with_truncation::<u8>())
        })
        .transpose()?;
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
                let v = v.to_primitive(context, PreferredType::String)?;
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
    let microsecond = partial_object
        .get(js_string!("microsecond"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            Ok::<u16, JsError>(finite.as_integer_with_truncation::<u16>())
        })
        .transpose()?;

    let millisecond = partial_object
        .get(js_string!("millisecond"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            Ok::<u16, JsError>(finite.as_integer_with_truncation::<u16>())
        })
        .transpose()?;

    let minute = partial_object
        .get(js_string!("minute"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            Ok::<u8, JsError>(finite.as_integer_with_truncation::<u8>())
        })
        .transpose()?;

    let month = partial_object
        .get(js_string!("month"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_positive_integer_with_truncation()
                .map_err(JsError::from)
        })
        .transpose()?;

    let month_code = partial_object
        .get(js_string!("monthCode"), context)?
        .map(|v| {
            let v = v.to_primitive(context, PreferredType::String)?;
            let Some(month_code) = v.as_string() else {
                return Err(JsNativeError::typ()
                    .with_message("The monthCode field value must be a string.")
                    .into());
            };
            MonthCode::from_str(&month_code.to_std_string_escaped()).map_err(JsError::from)
        })
        .transpose()?;

    let nanosecond = partial_object
        .get(js_string!("nanosecond"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            Ok::<u16, JsError>(finite.as_integer_with_truncation::<u16>())
        })
        .transpose()?;

    let offset = partial_object
        .get(js_string!("offset"), context)?
        .map(|v| to_offset_string(v, context))
        .transpose()?;

    let second = partial_object
        .get(js_string!("second"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            Ok::<u8, JsError>(finite.as_integer_with_truncation::<u8>())
        })
        .transpose()?;

    let time_zone = match zdt_fields_type {
        ZdtFieldsType::NoTimeZone => None,
        ZdtFieldsType::TimeZoneNotRequired | ZdtFieldsType::TimeZoneRequired => {
            let time_zone = partial_object
                .get(js_string!("timeZone"), context)?
                .map(|v| to_temporal_timezone_identifier(v, context))
                .transpose()?;
            if zdt_fields_type == ZdtFieldsType::TimeZoneRequired && time_zone.is_none() {
                return Err(JsNativeError::typ()
                    .with_message("timeZone is required to construct ZonedDateTime.")
                    .into());
            }
            time_zone
        }
    };

    let year = partial_object
        .get(js_string!("year"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            Ok::<i32, JsError>(finite.as_integer_with_truncation::<i32>())
        })
        .transpose()?;

    let calendar_fields = CalendarFields::new()
        .with_optional_year(year)
        .with_optional_month(month)
        .with_optional_month_code(month_code)
        .with_optional_day(day)
        .with_era(era)
        .with_era_year(era_year);

    let time = PartialTime::new()
        .with_hour(hour)
        .with_minute(minute)
        .with_second(second)
        .with_millisecond(millisecond)
        .with_microsecond(microsecond)
        .with_nanosecond(nanosecond);

    Ok((
        ZonedDateTimeFields {
            calendar_fields,
            time,
            offset,
        },
        time_zone,
    ))
}
