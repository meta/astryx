//! Boa's implementation of the ECMAScript `Temporal.PlainDateTime` built-in object.

use std::str::FromStr;

use crate::{
    Context, JsArgs, JsData, JsError, JsNativeError, JsObject, JsResult, JsString, JsSymbol,
    JsValue,
    builtins::{
        BuiltInBuilder, BuiltInConstructor, BuiltInObject, IntrinsicObject,
        options::{get_option, get_options_object},
        temporal::calendar::to_temporal_calendar_identifier,
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

#[cfg(test)]
mod tests;

use icu_calendar::AnyCalendarKind;
use temporal_rs::{
    Calendar, MonthCode, PlainDateTime as InnerDateTime, TinyAsciiStr,
    fields::{CalendarFields, DateTimeFields},
    options::{
        Disambiguation, DisplayCalendar, Overflow, RoundingIncrement, RoundingMode,
        RoundingOptions, ToStringRoundingOptions, Unit,
    },
    partial::{PartialDateTime, PartialTime},
};

use super::{
    PlainDate, ZonedDateTime,
    calendar::get_temporal_calendar_slot_value_with_default,
    create_temporal_date, create_temporal_duration, create_temporal_time,
    create_temporal_zoneddatetime,
    options::{TemporalUnitGroup, get_difference_settings, get_digits_option, get_temporal_unit},
    to_temporal_duration_record, to_temporal_time, to_temporal_timezone_identifier,
};

/// The `Temporal.PlainDateTime` built-in implementation.
///
/// More information:
///
/// - [ECMAScript Temporal proposal][spec]
/// - [MDN reference][mdn]
/// - [`temporal_rs` documentation][temporal_rs-docs]
///
/// [spec]: https://tc39.es/proposal-temporal/#sec-temporal-plaindatetime-objects
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime
/// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html
#[derive(Debug, Clone, Trace, Finalize, JsData)]
#[boa_gc(unsafe_empty_trace)] // Safety: InnerDateTime does not contain any traceable types.
pub struct PlainDateTime {
    pub(crate) inner: InnerDateTime,
}

impl PlainDateTime {
    fn new(inner: InnerDateTime) -> Self {
        Self { inner }
    }

    pub(crate) fn inner(&self) -> &InnerDateTime {
        &self.inner
    }
}

impl BuiltInObject for PlainDateTime {
    const NAME: JsString = StaticJsStrings::PLAIN_DATETIME_NAME;
}

impl IntrinsicObject for PlainDateTime {
    fn init(realm: &Realm) {
        let get_calendar_id = BuiltInBuilder::callable(realm, Self::get_calendar_id)
            .name(js_string!("get calendarId"))
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

        let get_day_of_week = BuiltInBuilder::callable(realm, Self::get_day_of_week)
            .name(js_string!("get dayOfWeek"))
            .build();

        let get_day_of_year = BuiltInBuilder::callable(realm, Self::get_day_of_year)
            .name(js_string!("get dayOfYear"))
            .build();

        let get_week_of_year = BuiltInBuilder::callable(realm, Self::get_week_of_year)
            .name(js_string!("get weekOfYear"))
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

        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .property(
                JsSymbol::to_string_tag(),
                StaticJsStrings::PLAIN_DATETIME_TAG,
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
            .static_method(Self::from, js_string!("from"), 1)
            .static_method(Self::compare, js_string!("compare"), 2)
            .method(Self::with, js_string!("with"), 1)
            .method(Self::with_plain_time, js_string!("withPlainTime"), 0)
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
            .method(Self::to_zoned_date_time, js_string!("toZonedDateTime"), 1)
            .method(Self::to_plain_date, js_string!("toPlainDate"), 0)
            .method(Self::to_plain_time, js_string!("toPlainTime"), 0)
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInConstructor for PlainDateTime {
    const CONSTRUCTOR_ARGUMENTS: usize = 3;
    const PROTOTYPE_STORAGE_SLOTS: usize = 61;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 2;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::plain_date_time;

    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is undefined, then
        if new_target.is_undefined() {
            // a. Throw a TypeError exception.
            return Err(JsNativeError::typ()
                .with_message("NewTarget cannot be undefined when constructing PlainDatedt.")
                .into());
        }

        // 2. Set isoYear to ? ToIntegerWithTruncation(isoYear).
        let iso_year = args
            .get_or_undefined(0)
            .to_finitef64(context)?
            .as_integer_with_truncation::<i32>();
        // 3. Set isoMonth to ? ToIntegerWithTruncation(isoMonth).
        let iso_month = args
            .get_or_undefined(1)
            .to_finitef64(context)?
            .as_integer_with_truncation::<u8>();
        // 4. Set isoDay to ? ToIntegerWithTruncation(isoDay).
        let iso_day = args
            .get_or_undefined(2)
            .to_finitef64(context)?
            .as_integer_with_truncation::<u8>();
        // 5. If hour is undefined, set hour to 0; else set hour to ? ToIntegerWithTruncation(hour).
        let hour = args.get_or_undefined(3).map_or(Ok::<u8, JsError>(0), |v| {
            let finite = v.to_finitef64(context)?;
            let int = finite.as_integer_with_truncation::<i8>();
            if int < 0 {
                return Err(JsNativeError::range()
                    .with_message("invalid time field")
                    .into());
            }
            Ok(int as u8)
        })?;
        // 6. If minute is undefined, set minute to 0; else set minute to ? ToIntegerWithTruncation(minute).
        let minute = args.get_or_undefined(4).map_or(Ok::<u8, JsError>(0), |v| {
            let finite = v.to_finitef64(context)?;
            let int = finite.as_integer_with_truncation::<i8>();
            if int < 0 {
                return Err(JsNativeError::range()
                    .with_message("invalid time field")
                    .into());
            }
            Ok(int as u8)
        })?;

        // 7. If second is undefined, set second to 0; else set second to ? ToIntegerWithTruncation(second).
        let second = args.get_or_undefined(5).map_or(Ok::<u8, JsError>(0), |v| {
            let finite = v.to_finitef64(context)?;
            let int = finite.as_integer_with_truncation::<i8>();
            if int < 0 {
                return Err(JsNativeError::range()
                    .with_message("invalid time field")
                    .into());
            }
            Ok(int as u8)
        })?;

        // 8. If millisecond is undefined, set millisecond to 0; else set millisecond to ? ToIntegerWithTruncation(millisecond).
        let millisecond = args
            .get_or_undefined(6)
            .map_or(Ok::<u16, JsError>(0), |v| {
                let finite = v.to_finitef64(context)?;
                let int = finite.as_integer_with_truncation::<i16>();
                if int < 0 {
                    return Err(JsNativeError::range()
                        .with_message("invalid time field")
                        .into());
                }
                Ok(int as u16)
            })?;

        // 9. If microsecond is undefined, set microsecond to 0; else set microsecond to ? ToIntegerWithTruncation(microsecond).
        let microsecond = args
            .get_or_undefined(7)
            .map_or(Ok::<u16, JsError>(0), |v| {
                let finite = v.to_finitef64(context)?;
                let int = finite.as_integer_with_truncation::<i16>();
                if int < 0 {
                    return Err(JsNativeError::range()
                        .with_message("invalid time field")
                        .into());
                }
                Ok(int as u16)
            })?;

        // 10. If nanosecond is undefined, set nanosecond to 0; else set nanosecond to ? ToIntegerWithTruncation(nanosecond).
        let nanosecond = args
            .get_or_undefined(8)
            .map_or(Ok::<u16, JsError>(0), |v| {
                let finite = v.to_finitef64(context)?;
                let int = finite.as_integer_with_truncation::<i16>();
                if int < 0 {
                    return Err(JsNativeError::range()
                        .with_message("invalid time field")
                        .into());
                }
                Ok(int as u16)
            })?;

        let calendar_slot = args
            .get_or_undefined(9)
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

        let dt = InnerDateTime::try_new(
            iso_year,
            iso_month,
            iso_day,
            hour,
            minute,
            second,
            millisecond,
            microsecond,
            nanosecond,
            calendar_slot,
        )?;

        // 12. Return ? CreateTemporalDateTime(isoYear, isoMonth, isoDay, hour, minute, second, millisecond, microsecond, nanosecond, calendar, NewTarget).
        create_temporal_datetime(dt, Some(new_target), context).map(Into::into)
    }
}

// ==== `PlainDateTimeTime` accessor methods implementation ====

impl PlainDateTime {
    /// 5.3.3 get `Temporal.PlainDateTime.prototype.calendarId`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindatetime.prototype.calendarid
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/calendarId
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.calendar
    fn get_calendar_id(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        Ok(JsString::from(dt.inner.calendar().identifier()).into())
    }

    /// 5.3.4 get `Temporal.PlainDateTime.prototype.era`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindatetime.prototype.era
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/era
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.era
    fn get_era(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        Ok(dt
            .inner
            .era()
            .map(|s| JsString::from(s.as_str()))
            .into_or_undefined())
    }

    /// 5.3.5 get `Temporal.PlainDateTime.prototype.eraYear`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindatetime.prototype.erayear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/eraYear
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.era_year
    fn get_era_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        Ok(dt.inner.era_year().into_or_undefined())
    }

    /// 5.3.6 get `Temporal.PlainDateTime.prototype.year`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindatetime.prototype.year
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/year
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.year
    fn get_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        Ok(dt.inner.year().into())
    }

    /// 5.3.7 get `Temporal.PlainDateTime.prototype.month`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindatetime.prototype.month
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/month
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html
    fn get_month(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        Ok(dt.inner.month().into())
    }

    /// 5.3.8 get `Temporal.PlainDateTime.prototype.monthCode`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindatetime.prototype.monthcode
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/monthCode
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.month_code
    fn get_month_code(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        Ok(JsString::from(dt.inner.month_code().as_str()).into())
    }

    /// 5.3.9 get `Temporal.PlainDateTime.prototype.day`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindatetime.prototype.day
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/day
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.day
    fn get_day(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        Ok(dt.inner.day().into())
    }

    /// 5.3.10 get `Temporal.PlainDateTime.prototype.hour`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindatetime.prototype.hour
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/hour
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.hour
    fn get_hour(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let dateTime be the this value.
        // 2. Perform ? RequireInternalSlot(dateTime, [[InitializedTemporalDateTime]]).
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        // 3. Return 𝔽(datedt.[[ISOHour]]).
        Ok(dt.inner.hour().into())
    }

    /// 5.3.11 get `Temporal.PlainDateTime.prototype.minute`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindatetime.prototype.minute
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/minute
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.minute
    fn get_minute(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let dateTime be the this value.
        // 2. Perform ? RequireInternalSlot(dateTime, [[InitializedTemporalDateTime]]).
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        // 3. Return 𝔽(datedt.[[ISOMinute]]).
        Ok(dt.inner.minute().into())
    }

    /// 5.3.12 get `Temporal.PlainDateTime.prototype.second`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindatetime.prototype.second
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/second
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.second
    fn get_second(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let dateTime be the this value.
        // 2. Perform ? RequireInternalSlot(dateTime, [[InitializedTemporalDateTime]]).
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        // 3. Return 𝔽(datedt.[[ISOSecond]]).
        Ok(dt.inner.second().into())
    }

    /// 5.3.13 get `Temporal.PlainDateTime.prototype.millisecond`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindatetime.prototype.millisecond
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/millisecond
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.millisecond
    fn get_millisecond(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let dateTime be the this value.
        // 2. Perform ? RequireInternalSlot(dateTime, [[InitializedTemporalDateTime]]).
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        // 3. Return 𝔽(datedt.[[ISOMillisecond]]).
        Ok(dt.inner.millisecond().into())
    }

    /// 5.3.14 get `Temporal.PlainDateTime.prototype.microsecond`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindatetime.prototype.microsecond
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/microsecond
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.microsecond
    fn get_microsecond(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let dateTime be the this value.
        // 2. Perform ? RequireInternalSlot(dateTime, [[InitializedTemporalDateTime]]).
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        // 3. Return 𝔽(datedt.[[ISOMicrosecond]]).
        Ok(dt.inner.microsecond().into())
    }

    /// 5.3.15 get `Temporal.PlainDateTime.prototype.nanosecond`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindatetime.prototype.nanosecond
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/nanosecond
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.nanosecond
    fn get_nanosecond(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let dateTime be the this value.
        // 2. Perform ? RequireInternalSlot(dateTime, [[InitializedTemporalDateTime]]).
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        // 3. Return 𝔽(datedt.[[ISONanosecond]]).
        Ok(dt.inner.nanosecond().into())
    }

    /// 5.3.16 get `Temporal.PlainDateTime.prototype.dayOfWeek`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindatetime.prototype.dayofweek
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/dayOfWeek
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.day_of_week
    fn get_day_of_week(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        Ok(dt.inner.day_of_week().into())
    }

    /// 5.3.17 get `Temporal.PlainDateTime.prototype.dayOfYear`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindatetime.prototype.dayofyear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/dayOfYear
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.day_of_year
    fn get_day_of_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        Ok(dt.inner.day_of_year().into())
    }

    /// 5.3.18 get `Temporal.PlainDateTime.prototype.weekOfYear`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindatetime.prototype.weekofyear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/weekOfYear
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.week_of_year
    fn get_week_of_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        Ok(dt.inner.week_of_year().into_or_undefined())
    }

    /// 5.3.19 get `Temporal.PlainDateTime.prototype.yearOfWeek`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindatetime.prototype.yearofweek
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/yearOfWeek
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.year_of_week
    fn get_year_of_week(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        Ok(dt.inner.year_of_week().into_or_undefined())
    }

    /// 5.3.20 get `Temporal.PlainDateTime.prototype.daysInWeek`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindatetime.prototype.daysinweek
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/daysInWeek
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.days_in_week
    fn get_days_in_week(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        Ok(dt.inner.days_in_week().into())
    }

    /// 5.3.21 get `Temporal.PlainDateTime.prototype.daysInMonth`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindatetime.prototype.daysinmonth
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/daysInMonth
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.days_in_month
    fn get_days_in_month(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        Ok(dt.inner.days_in_month().into())
    }

    /// 5.3.22 get `Temporal.PlainDateTime.prototype.daysInYear`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindatetime.prototype.daysinyear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/daysInYear
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.days_in_year
    fn get_days_in_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        Ok(dt.inner.days_in_year().into())
    }

    /// 5.3.23 get `Temporal.PlainDateTime.prototype.monthsInYear`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindatetime.prototype.monthsinyear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/monthsInYear
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.months_in_year
    fn get_months_in_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        Ok(dt.inner.months_in_year().into())
    }

    /// 5.3.24 get `Temporal.PlainDateTime.prototype.inLeapYear`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindatetime.prototype.inleapyear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/inLeapYear
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.in_leap_year
    fn get_in_leap_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        Ok(dt.inner.in_leap_year().into())
    }
}

// ==== PlainDateTime static methods implementation ====

impl PlainDateTime {
    /// 5.2.2 `Temporal.PlainDateTime.from ( item [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindatetime.from
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/from
    fn from(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let item = args.get_or_undefined(0);
        // 1. Set options to ? GetOptionsObject(options).
        let options = args.get(1);
        // 2. If item is an Object and item has an [[InitializedTemporalDateTime]] internal slot, then
        let object = item.as_object();
        let dt = if let Some(pdt) = object.as_ref().and_then(JsObject::downcast_ref::<Self>) {
            // a. Perform ? GetTemporalOverflowOption(options).
            let options = get_options_object(args.get_or_undefined(1))?;
            let _ = get_option::<Overflow>(&options, js_string!("overflow"), context)?;
            // b. Return ! CreateTemporalDateTime(item.[[ISOYear]], item.[[ISOMonth]],
            // item.[[ISODay]], item.[[ISOHour]], item.[[ISOMinute]], item.[[ISOSecond]],
            // item.[[ISOMillisecond]], item.[[ISOMicrosecond]], item.[[ISONanosecond]],
            // item.[[Calendar]]).
            pdt.inner.clone()
        } else {
            to_temporal_datetime(item, options.cloned(), context)?
        };

        // 3. Return ? ToTemporalDateTime(item, options).
        create_temporal_datetime(dt, None, context).map(Into::into)
    }

    /// 5.2.3 `Temporal.PlainDateTime.compare ( one, two )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindatetime.compare
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/compare
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.compare_iso
    fn compare(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Set one to ? ToTemporalDateTime(one).
        let one = to_temporal_datetime(args.get_or_undefined(0), None, context)?;
        // 2. Set two to ? ToTemporalDateTime(two).
        let two = to_temporal_datetime(args.get_or_undefined(1), None, context)?;

        // 3. Return 𝔽(CompareISODateTime(one.[[ISOYear]], one.[[ISOMonth]], one.[[ISODay]],
        // one.[[ISOHour]], one.[[ISOMinute]], one.[[ISOSecond]], one.[[ISOMillisecond]],
        // one.[[ISOMicrosecond]], one.[[ISONanosecond]], two.[[ISOYear]], two.[[ISOMonth]],
        // two.[[ISODay]], two.[[ISOHour]], two.[[ISOMinute]], two.[[ISOSecond]],
        // two.[[ISOMillisecond]], two.[[ISOMicrosecond]], two.[[ISONanosecond]])).
        Ok((one.compare_iso(&two) as i8).into())
    }
}

// ==== PlainDateTime methods implementation ====

impl PlainDateTime {
    ///  5.3.25 `Temporal.PlainDateTime.prototype.with ( temporalDateTimeLike [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindatetime.prototype.with
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/with
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.with
    fn with(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let plainDateTime be the this value.
        // 2. Perform ? RequireInternalSlot(plainDateTime, [[InitializedTemporalDateTime]]).
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        // 3. If ? IsPartialTemporalObject(temporalDateTimeLike) is false, throw a TypeError exception.
        let Some(partial_object) =
            super::is_partial_temporal_object(args.get_or_undefined(0), context)?
        else {
            return Err(JsNativeError::typ()
                .with_message("with object was not a PartialTemporalObject.")
                .into());
        };
        // 4. Let calendar be plainDateTime.[[Calendar]].
        // 5. Let fields be ISODateToFields(calendar, plainDateTime.[[ISODateTime]].[[ISODate]], date).
        // 6. Set fields.[[Hour]] to plainDateTime.[[ISODateTime]].[[Time]].[[Hour]].
        // 7. Set fields.[[Minute]] to plainDateTime.[[ISODateTime]].[[Time]].[[Minute]].
        // 8. Set fields.[[Second]] to plainDateTime.[[ISODateTime]].[[Time]].[[Second]].
        // 9. Set fields.[[Millisecond]] to plainDateTime.[[ISODateTime]].[[Time]].[[Millisecond]].
        // 10. Set fields.[[Microsecond]] to plainDateTime.[[ISODateTime]].[[Time]].[[Microsecond]].
        // 11. Set fields.[[Nanosecond]] to plainDateTime.[[ISODateTime]].[[Time]].[[Nanosecond]].
        // 12. Let partialDateTime be ? PrepareCalendarFields(calendar, temporalDateTimeLike, « year, month, month-code, day », « hour, minute, second, millisecond, microsecond, nanosecond », partial).
        // 13. Set fields to CalendarMergeFields(calendar, fields, partialDateTime).
        let fields = to_date_time_fields(&partial_object, dt.inner.calendar(), context)?;
        // 14. Let resolvedOptions be ? GetOptionsObject(options).
        let options = get_options_object(args.get_or_undefined(1))?;
        // 15. Let overflow be ? GetTemporalOverflowOption(resolvedOptions).
        let overflow = get_option::<Overflow>(&options, js_string!("overflow"), context)?;

        // 16. Let result be ? InterpretTemporalDateTimeFields(calendar, fields, overflow).
        // 17. Return ? CreateTemporalDateTime(result, calendar).
        create_temporal_datetime(dt.inner.with(fields, overflow)?, None, context).map(Into::into)
    }

    /// 5.3.26 Temporal.PlainDateTime.prototype.withPlainTime ( `[ plainTimeLike ]` )
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindatetime.prototype.withplaintime
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/withPlainTime
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.with_plain_time
    fn with_plain_time(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        let time = args
            .get_or_undefined(0)
            .map(|v| to_temporal_time(v, None, context))
            .transpose()?;

        create_temporal_datetime(dt.inner.with_time(time)?, None, context).map(Into::into)
    }

    /// 5.3.27 `Temporal.PlainDateTime.prototype.withCalendar ( calendarLike )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindatetime.prototype.withCalendar
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/withCalendar
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.with_calendar
    fn with_calendar(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        let calendar = to_temporal_calendar_identifier(args.get_or_undefined(0))?;

        create_temporal_datetime(dt.inner.with_calendar(calendar), None, context).map(Into::into)
    }

    /// 5.3.28 `Temporal.PlainDateTime.prototype.add ( temporalDurationLike [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindatetime.prototype.add
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/add
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.add
    fn add(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let temporalDate be the this value.
        // 2. Perform ? RequireInternalSlot(temporalDate, [[InitializedTemporalDate]]).
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        // 3. Let duration be ? ToTemporalDuration(temporalDurationLike).
        let duration = to_temporal_duration_record(args.get_or_undefined(0), context)?;

        // 4. Set options to ? GetOptionsObject(options).
        let options = get_options_object(args.get_or_undefined(1))?;
        let overflow = get_option::<Overflow>(&options, js_string!("overflow"), context)?;

        // 5. Let calendarRec be ? CreateCalendarMethodsRecord(temporalDate.[[Calendar]], « date-add »).
        // 6. Return ? AddDate(calendarRec, temporalDate, duration, options).
        create_temporal_datetime(dt.inner.add(&duration, overflow)?, None, context).map(Into::into)
    }

    /// 5.3.29 `Temporal.PlainDateTime.prototype.subtract ( temporalDurationLike [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindatetime.prototype.subtract
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/subtract
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.subtract
    fn subtract(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let temporalDate be the this value.
        // 2. Perform ? RequireInternalSlot(temporalDate, [[InitializedTemporalDate]]).
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        // 3. Let duration be ? ToTemporalDuration(temporalDurationLike).
        let duration = to_temporal_duration_record(args.get_or_undefined(0), context)?;

        // 4. Set options to ? GetOptionsObject(options).
        let options = get_options_object(args.get_or_undefined(1))?;
        let overflow = get_option::<Overflow>(&options, js_string!("overflow"), context)?;

        // 5. Let negatedDuration be CreateNegatedTemporalDuration(duration).
        // 6. Let calendarRec be ? CreateCalendarMethodsRecord(temporalDate.[[Calendar]], « date-add »).
        // 7. Return ? AddDate(calendarRec, temporalDate, negatedDuration, options).
        create_temporal_datetime(dt.inner.subtract(&duration, overflow)?, None, context)
            .map(Into::into)
    }

    /// 5.3.30 `Temporal.PlainDateTime.prototype.until ( other [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindatetime.prototype.until
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/until
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.until
    fn until(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        let other = to_temporal_datetime(args.get_or_undefined(0), None, context)?;

        let options = get_options_object(args.get_or_undefined(1))?;
        let settings = get_difference_settings(&options, context)?;

        create_temporal_duration(dt.inner.until(&other, settings)?, None, context).map(Into::into)
    }

    /// 5.3.31 `Temporal.PlainDateTime.prototype.since ( other [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindatetime.prototype.since
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/since
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.since
    fn since(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        let other = to_temporal_datetime(args.get_or_undefined(0), None, context)?;

        let options = get_options_object(args.get_or_undefined(1))?;
        let settings = get_difference_settings(&options, context)?;

        create_temporal_duration(dt.inner.since(&other, settings)?, None, context).map(Into::into)
    }

    /// 5.3.32 Temporal.PlainDateTime.prototype.round ( roundTo )
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindatetime.prototype.round
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/round
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.round
    fn round(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainTime object.")
            })?;

        // 3. If roundTo is undefined, then
        let round_to_arg = args.get_or_undefined(0);
        if round_to_arg.is_undefined() {
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

        let mut options = RoundingOptions::default();

        options.increment =
            get_option::<RoundingIncrement>(&round_to, js_string!("roundingIncrement"), context)?;

        // 8. Let roundingMode be ? ToTemporalRoundingMode(roundTo, "halfExpand").
        options.rounding_mode =
            get_option::<RoundingMode>(&round_to, js_string!("roundingMode"), context)?;

        // 9. Let smallestUnit be ? GetTemporalUnit(roundTo, "smallestUnit", TIME, REQUIRED, undefined).
        options.smallest_unit = get_temporal_unit(
            &round_to,
            js_string!("smallestUnit"),
            TemporalUnitGroup::Time,
            Some(vec![Unit::Day]),
            context,
        )?;

        create_temporal_datetime(dt.inner().round(options)?, None, context).map(Into::into)
    }

    /// 5.3.33 Temporal.PlainDateTime.prototype.equals ( other )
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindatetime.prototype.equals
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/equals
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#impl-Eq-for-PlainDateTime
    fn equals(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let dateTime be the this value.
        // 2. Perform ? RequireInternalSlot(dateTime, [[InitializedTemporalDateTime]]).
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        // 3. Set other to ? ToTemporalDateTime(other).
        let other = to_temporal_datetime(args.get_or_undefined(0), None, context)?;

        // 4. Let result be CompareISODateTime(dateTime.[[ISOYear]], dateTime.[[ISOMonth]],
        // dateTime.[[ISODay]], dateTime.[[ISOHour]], dateTime.[[ISOMinute]],
        // dateTime.[[ISOSecond]], dateTime.[[ISOMillisecond]], dateTime.[[ISOMicrosecond]],
        // dateTime.[[ISONanosecond]], other.[[ISOYear]], other.[[ISOMonth]], other.[[ISODay]],
        // other.[[ISOHour]], other.[[ISOMinute]], other.[[ISOSecond]], other.[[ISOMillisecond]],
        // other.[[ISOMicrosecond]], other.[[ISONanosecond]]).
        // 5. If result is not 0, return false.
        // 6. Return ? CalendarEquals(dateTime.[[Calendar]], other.[[Calendar]]).
        Ok((dt.inner == other).into())
    }

    /// 5.3.34 `Temporal.PlainDateTime.prototype.toString ( [ options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindatetime.prototype.with
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/with
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.to_ixdtf_string
    fn to_string(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        let options = get_options_object(args.get_or_undefined(0))?;

        let show_calendar =
            get_option::<DisplayCalendar>(&options, js_string!("calendarName"), context)?
                .unwrap_or(DisplayCalendar::Auto);
        let precision = get_digits_option(&options, context)?;
        let rounding_mode =
            get_option::<RoundingMode>(&options, js_string!("roundingMode"), context)?;
        let smallest_unit = get_option::<Unit>(&options, js_string!("smallestUnit"), context)?;

        let ixdtf = dt.inner.to_ixdtf_string(
            ToStringRoundingOptions {
                precision,
                smallest_unit,
                rounding_mode,
            },
            show_calendar,
        )?;
        Ok(JsString::from(ixdtf).into())
    }

    /// 5.3.35 `Temporal.PlainDateTime.prototype.toLocaleString ( [ locales [ , options ] ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindatetime.prototype.with
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/with
    fn to_locale_string(this: &JsValue, _args: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // TODO: Update for ECMA-402 compliance
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        let ixdtf = dt
            .inner
            .to_ixdtf_string(ToStringRoundingOptions::default(), DisplayCalendar::Auto)?;
        Ok(JsString::from(ixdtf).into())
    }

    /// 5.3.36 `Temporal.PlainDateTime.prototype.toJSON ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindatetime.prototype.with
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/with
    fn to_json(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        let ixdtf = dt
            .inner
            .to_ixdtf_string(ToStringRoundingOptions::default(), DisplayCalendar::Auto)?;
        Ok(JsString::from(ixdtf).into())
    }

    /// 5.3.37 `Temporal.PlainDateTime.prototype.valueOf ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindatetime.prototype.with
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/with
    pub(crate) fn value_of(_this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Err(JsNativeError::typ()
            .with_message("`valueOf` not supported by Temporal built-ins. See 'compare', 'equals', or `toString`")
            .into())
    }

    /// 5.3.38 `Temporal.PlainDateTime.prototype.toZonedDateTime ( temporalTimeZoneLike [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindatetime.prototype.tozoneddatetime
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/toZonedDateTime
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.to_zoned_date_time
    fn to_zoned_date_time(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateTime be the this value.
        // 2. Perform ? RequireInternalSlot(dateTime, [[InitializedTemporalDateTime]]).
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;
        // 3. Let timeZone be ? ToTemporalTimeZoneIdentifier(temporalTimeZoneLike).
        let timezone = to_temporal_timezone_identifier(args.get_or_undefined(0), context)?;
        // 4. Let resolvedOptions be ? GetOptionsObject(options).
        let options = get_options_object(args.get_or_undefined(1))?;
        // 5. Let disambiguation be ? GetTemporalDisambiguationOption(resolvedOptions).
        let disambiguation =
            get_option::<Disambiguation>(&options, js_string!("disambiguation"), context)?
                .unwrap_or_default();

        // 6. Let epochNs be ? GetEpochNanosecondsFor(timeZone, dateTime.[[ISODateTime]], disambiguation).
        // 7. Return ! CreateTemporalZonedDateTime(epochNs, timeZone, dateTime.[[Calendar]]).

        let result = dt.inner.to_zoned_date_time_with_provider(
            timezone,
            disambiguation,
            context.timezone_provider(),
        )?;
        create_temporal_zoneddatetime(result, None, context).map(Into::into)
    }

    /// 5.3.39 `Temporal.PlainDateTime.prototype.toPlainDate ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindatetime.prototype.toplaindate
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/toPlainDate
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.to_plain_date
    fn to_plain_date(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        let result = dt.inner.to_plain_date();
        create_temporal_date(result, None, context).map(Into::into)
    }

    /// 5.3.40 `Temporal.PlainDateTime.prototype.toPlainTime ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindatetime.prototype.toplaintime
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDateTime/toPlainTime
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDateTime.html#method.to_plain_time
    fn to_plain_time(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let dt = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDateTime object.")
            })?;

        let result = dt.inner.to_plain_time();
        create_temporal_time(result, None, context).map(Into::into)
    }
}

// ==== PlainDateTime Abstract Operations ====

pub(crate) fn create_temporal_datetime(
    inner: InnerDateTime,
    new_target: Option<&JsValue>,
    context: &mut Context,
) -> JsResult<JsObject> {
    // NOTE(nekevss): The below validations should be upheld with the creation of `InnerDateTime`.
    // 1. If IsValidISODate(isoYear, isoMonth, isoDay) is false, throw a RangeError exception.
    // 2. If IsValidTime(hour, minute, second, millisecond, microsecond, nanosecond) is false, throw a RangeError exception.
    // 3. If ISODateTimeWithinLimits(isoYear, isoMonth, isoDay, hour, minute, second, millisecond, microsecond, nanosecond) is false, then
    // a. Throw a RangeError exception.

    // 4. If newTarget is not present, set newTarget to %Temporal.PlainDateTime%.
    let new_target = if let Some(new_target) = new_target {
        new_target.clone()
    } else {
        context
            .realm()
            .intrinsics()
            .constructors()
            .plain_date_time()
            .constructor()
            .into()
    };

    // 5. Let object be ? OrdinaryCreateFromConstructor(newTarget, "%Temporal.PlainDateTime.prototype%", « [[InitializedTemporalDateTime]], [[ISOYear]], [[ISOMonth]], [[ISODay]], [[ISOHour]], [[ISOMinute]], [[ISOSecond]], [[ISOMillisecond]], [[ISOMicrosecond]], [[ISONanosecond]], [[Calendar]] »).
    let prototype = get_prototype_from_constructor(
        &new_target,
        StandardConstructors::plain_date_time,
        context,
    )?;

    // 6. Set object.[[ISOYear]] to isoYear.
    // 7. Set object.[[ISOMonth]] to isoMonth.
    // 8. Set object.[[ISODay]] to isoDay.
    // 9. Set object.[[ISOHour]] to hour.
    // 10. Set object.[[ISOMinute]] to minute.
    // 11. Set object.[[ISOSecond]] to second.
    // 12. Set object.[[ISOMillisecond]] to millisecond.
    // 13. Set object.[[ISOMicrosecond]] to microsecond.
    // 14. Set object.[[ISONanosecond]] to nanosecond.
    // 15. Set object.[[Calendar]] to calendar.
    let obj = JsObject::from_proto_and_data(prototype, PlainDateTime::new(inner));

    // 16. Return object.
    Ok(obj)
}

pub(crate) fn to_temporal_datetime(
    value: &JsValue,
    options: Option<JsValue>,
    context: &mut Context,
) -> JsResult<InnerDateTime> {
    // 1. If options is not present, set options to undefined.
    // 2. Let resolvedOptions be ? SnapshotOwnProperties(! GetOptionsObject(options), null).
    // 3. If item is an Object, then
    if let Some(object) = value.as_object() {
        // a. If item has an [[InitializedTemporalDateTime]] internal slot, then
        if let Some(dt) = object.downcast_ref::<PlainDateTime>() {
            // i. Return item.
            return Ok(dt.inner.clone());
        // b. If item has an [[InitializedTemporalZonedDateTime]] internal slot, then
        } else if let Some(zdt) = object.downcast_ref::<ZonedDateTime>() {
            // i. Perform ? GetTemporalOverflowOption(resolvedOptions).
            let options = get_options_object(&options.unwrap_or_default())?;
            let _ = get_option::<Overflow>(&options, js_string!("overflow"), context)?;
            // ii. Let instant be ! CreateTemporalInstant(item.[[Nanoseconds]]).
            // iii. Let timeZoneRec be ? CreateTimeZoneMethodsRecord(item.[[TimeZone]], « get-offset-nanoseconds-for »).
            // iv. Return ? GetPlainDateTimeFor(timeZoneRec, instant, item.[[Calendar]]).
            return Ok(zdt.inner.to_plain_date_time());
        // c. If item has an [[InitializedTemporalDate]] internal slot, then
        } else if let Some(date) = object.downcast_ref::<PlainDate>() {
            // i. Perform ? GetTemporalOverflowOption(resolvedOptions).
            let options = get_options_object(&options.unwrap_or_default())?;
            let _ = get_option::<Overflow>(&options, js_string!("overflow"), context)?;
            // ii. Return ? CreateTemporalDateTime(item.[[ISOYear]], item.[[ISOMonth]], item.[[ISODay]], 0, 0, 0, 0, 0, 0, item.[[Calendar]]).
            return Ok(date.inner.to_plain_date_time(None)?);
        }

        // d. Let calendar be ? GetTemporalCalendarSlotValueWithISODefault(item).
        // e. Let calendarRec be ? CreateCalendarMethodsRecord(calendar, « date-from-fields, fields »).
        // f. Let fields be ? PrepareCalendarFields(calendarRec, item, « "day", "month",
        // "monthCode", "year" », « "hour", "microsecond", "millisecond", "minute",
        // "nanosecond", "second" », «»)
        // TODO: Move validation to `temporal_rs`.
        let partial_dt = to_partial_datetime(&object, context)?;
        let resolved_options = get_options_object(&options.unwrap_or_default())?;
        // g. Let result be ? InterpretTemporalDateTimeFields(calendarRec, fields, resolvedOptions).
        let overflow = get_option::<Overflow>(&resolved_options, js_string!("overflow"), context)?;
        return InnerDateTime::from_partial(partial_dt, overflow).map_err(Into::into);
    }
    // 4. Else,
    //     a. If item is not a String, throw a TypeError exception.
    let Some(string) = value.as_string() else {
        return Err(JsNativeError::typ()
            .with_message("Cannot convert unrecognized value to PlainDateTime.")
            .into());
    };
    // b. Let result be ? ParseTemporalDateTimeString(item).
    // c. Assert: IsValidISODate(result.[[Year]], result.[[Month]], result.[[Day]]) is true.
    // d. Assert: IsValidTime(result.[[Hour]], result.[[Minute]], result.[[Second]],
    // result.[[Millisecond]], result.[[Microsecond]], result.[[Nanosecond]]) is true.
    // e. Let calendar be result.[[Calendar]].
    // f. If calendar is empty, set calendar to "iso8601".
    // g. If IsBuiltinCalendar(calendar) is false, throw a RangeError exception.
    // h. Set calendar to CanonicalizeUValue("ca", calendar).
    let date = string.to_std_string_escaped().parse::<InnerDateTime>()?;
    // i. Perform ? GetTemporalOverflowOption(resolvedOptions).
    let resolved_options = get_options_object(&options.unwrap_or_default())?;
    let _ = get_option::<Overflow>(&resolved_options, js_string!("overflow"), context)?;
    // 5. Return ? CreateTemporalDateTime(result.[[Year]], result.[[Month]], result.[[Day]],
    // result.[[Hour]], result.[[Minute]], result.[[Second]], result.[[Millisecond]],
    // result.[[Microsecond]], result.[[Nanosecond]], calendar).
    Ok(date)
}

fn to_partial_datetime(
    partial_object: &JsObject,
    context: &mut Context,
) -> JsResult<PartialDateTime> {
    let calendar = get_temporal_calendar_slot_value_with_default(partial_object, context)?;
    let fields = to_date_time_fields(partial_object, &calendar, context)?;
    Ok(PartialDateTime { fields, calendar })
}

fn to_date_time_fields(
    partial_object: &JsObject,
    calendar: &Calendar,
    context: &mut Context,
) -> JsResult<DateTimeFields> {
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
            let v = v.to_primitive(context, crate::value::PreferredType::String)?;
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

    let second = partial_object
        .get(js_string!("second"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            Ok::<u8, JsError>(finite.as_integer_with_truncation::<u8>())
        })
        .transpose()?;

    let year = partial_object
        .get(js_string!("year"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            Ok::<i32, JsError>(finite.as_integer_with_truncation::<i32>())
        })
        .transpose()?;

    let calendar_fields = CalendarFields {
        year,
        month,
        month_code,
        day,
        era,
        era_year,
    };
    let time = PartialTime {
        hour,
        minute,
        second,
        millisecond,
        microsecond,
        nanosecond,
    };

    Ok(DateTimeFields {
        calendar_fields,
        time,
    })
}
