//! Boa's implementation of the ECMAScript `Temporal.PlainDate` built-in object.
//!
//! This implementation is a ECMAScript compliant wrapper around the `temporal_rs` library.

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
use icu_calendar::AnyCalendarKind;
use temporal_rs::{
    Calendar, MonthCode, PlainDate as InnerDate, TinyAsciiStr,
    fields::CalendarFields,
    options::{DisplayCalendar, Overflow},
    partial::PartialDate,
};

use super::{
    PlainDateTime, ZonedDateTime, calendar::get_temporal_calendar_slot_value_with_default,
    create_temporal_datetime, create_temporal_duration, create_temporal_zoneddatetime,
    options::get_difference_settings, to_temporal_duration_record, to_temporal_time,
    to_temporal_timezone_identifier,
};
use super::{create_temporal_month_day, create_temporal_year_month};

#[cfg(feature = "temporal")]
#[cfg(test)]
mod tests;

/// `Temporal.PlainDate` built-in implementation
///
/// A `Temporal.PlainDate` is a calendar date represented by ISO date fields
/// and a calendar system.
///
/// More information:
///
/// - [ECMAScript Temporal proposal][spec]
/// - [MDN reference][mdn]
/// - [`temporal_rs` documentation][temporal_rs-docs]
///
/// [spec]: https://tc39.es/proposal-temporal/#sec-temporal-plaindate-objects
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate
/// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html
#[derive(Debug, Clone, Trace, Finalize, JsData)]
#[boa_gc(unsafe_empty_trace)]
pub struct PlainDate {
    pub(crate) inner: InnerDate,
}

impl PlainDate {
    pub(crate) fn new(inner: InnerDate) -> Self {
        Self { inner }
    }
}

impl BuiltInObject for PlainDate {
    const NAME: JsString = StaticJsStrings::PLAIN_DATE_NAME;
}

impl IntrinsicObject for PlainDate {
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
                StaticJsStrings::PLAIN_DATE_TAG,
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
            .method(Self::to_plain_year_month, js_string!("toPlainYearMonth"), 0)
            .method(Self::to_plain_month_day, js_string!("toPlainMonthDay"), 0)
            .method(Self::add, js_string!("add"), 1)
            .method(Self::subtract, js_string!("subtract"), 1)
            .method(Self::with, js_string!("with"), 1)
            .method(Self::with_calendar, js_string!("withCalendar"), 1)
            .method(Self::until, js_string!("until"), 1)
            .method(Self::since, js_string!("since"), 1)
            .method(Self::equals, js_string!("equals"), 1)
            .method(Self::to_plain_date_time, js_string!("toPlainDateTime"), 0)
            .method(Self::to_zoned_date_time, js_string!("toZonedDateTime"), 1)
            .method(Self::to_string, js_string!("toString"), 0)
            .method(Self::to_locale_string, js_string!("toLocaleString"), 0)
            .method(Self::to_json, js_string!("toJSON"), 0)
            .method(Self::value_of, js_string!("valueOf"), 0)
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInConstructor for PlainDate {
    const CONSTRUCTOR_ARGUMENTS: usize = 3;
    const PROTOTYPE_STORAGE_SLOTS: usize = 48;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 2;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::plain_date;

    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        if new_target.is_undefined() {
            return Err(JsNativeError::typ()
                .with_message("NewTarget cannot be undefined.")
                .into());
        }

        let year = args
            .get_or_undefined(0)
            .to_finitef64(context)?
            .as_integer_with_truncation::<i32>();
        let month = args
            .get_or_undefined(1)
            .to_finitef64(context)?
            .as_integer_with_truncation::<u8>();
        let day = args
            .get_or_undefined(2)
            .to_finitef64(context)?
            .as_integer_with_truncation::<u8>();
        let calendar_slot = args
            .get_or_undefined(3)
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

        let inner = InnerDate::try_new(year, month, day, calendar_slot)?;

        Ok(create_temporal_date(inner, Some(new_target), context)?.into())
    }
}

// ==== `PlainDate` accessors implementation ====

impl PlainDate {
    /// 3.3.3 get `Temporal.PlainDate.prototype.calendarId`
    ///
    /// Returns the calendar identifier for this `Temporal.PlainDate`.
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindate.prototype.calendarid
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/calendarId
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.calendar
    fn get_calendar_id(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let date = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDate object.")
            })?;

        Ok(JsString::from(date.inner.calendar().identifier()).into())
    }

    /// 3.3.4 get `Temporal.PlainDate.prototype.era`
    ///
    /// Returns the era identifier for this `Temporal.PlainDate`.
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindate.prototype.era
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/era
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.era
    fn get_era(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let obj = this
            .as_object()
            .ok_or_else(|| JsNativeError::typ().with_message("this must be an object."))?;

        let Some(date) = obj.downcast_ref::<Self>() else {
            return Err(JsNativeError::typ()
                .with_message("the this object must be a PlainDate object.")
                .into());
        };

        Ok(date
            .inner
            .era()
            .map(|s| JsString::from(s.as_str()))
            .into_or_undefined())
    }

    /// 3.3.5 get `Temporal.PlainDate.prototype.eraYear`
    ///
    /// Returns the year within the era for this `Temporal.PlainDate`.
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindate.prototype.erayear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/eraYear
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.era_year
    fn get_era_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let obj = this
            .as_object()
            .ok_or_else(|| JsNativeError::typ().with_message("this must be an object."))?;

        let Some(date) = obj.downcast_ref::<Self>() else {
            return Err(JsNativeError::typ()
                .with_message("the this object must be a PlainDate object.")
                .into());
        };

        Ok(date.inner.era_year().into_or_undefined())
    }

    /// 3.3.6 get `Temporal.PlainDate.prototype.year`
    ///
    /// Returns the calendar year for this `Temporal.PlainDate`.
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindate.prototype.year
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/year
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.year
    fn get_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let obj = this
            .as_object()
            .ok_or_else(|| JsNativeError::typ().with_message("this must be an object."))?;

        let Some(date) = obj.downcast_ref::<Self>() else {
            return Err(JsNativeError::typ()
                .with_message("the this object must be a PlainDate object.")
                .into());
        };

        Ok(date.inner.year().into())
    }

    /// 3.3.7 get `Temporal.PlainDate.prototype.month`
    ///
    /// Returns the calendar month for this `Temporal.PlainDate`.
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindate.prototype.month
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/month
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.month
    fn get_month(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let obj = this
            .as_object()
            .ok_or_else(|| JsNativeError::typ().with_message("this must be an object."))?;

        let Some(date) = obj.downcast_ref::<Self>() else {
            return Err(JsNativeError::typ()
                .with_message("the this object must be a PlainDate object.")
                .into());
        };

        Ok(date.inner.month().into())
    }

    /// 3.3.8 get Temporal.PlainDate.prototype.monthCode
    ///
    /// Returns the month code of the calendar month for this `Temporal.PlainDate`.
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindate.prototype.monthcode
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/monthCode
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.month_code
    fn get_month_code(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let obj = this
            .as_object()
            .ok_or_else(|| JsNativeError::typ().with_message("this must be an object."))?;

        let Some(date) = obj.downcast_ref::<Self>() else {
            return Err(JsNativeError::typ()
                .with_message("the this object must be a PlainDate object.")
                .into());
        };

        Ok(JsString::from(date.inner.month_code().as_str()).into())
    }

    /// 3.3.9 get `Temporal.PlainDate.prototype.day`
    ///
    /// Returns the day in the calendar month for this `Temporal.PlainDate`.
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindate.prototype.day
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/day
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.day
    fn get_day(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let obj = this
            .as_object()
            .ok_or_else(|| JsNativeError::typ().with_message("this must be an object."))?;

        let Some(date) = obj.downcast_ref::<Self>() else {
            return Err(JsNativeError::typ()
                .with_message("the this object must be a PlainDate object.")
                .into());
        };

        Ok(date.inner.day().into())
    }

    /// 3.3.10 get `Temporal.PlainDate.prototype.dayOfWeek`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindate.prototype.dayofweek
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/dayOfWeek
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.day_of_week
    fn get_day_of_week(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let obj = this
            .as_object()
            .ok_or_else(|| JsNativeError::typ().with_message("this must be an object."))?;

        let Some(date) = obj.downcast_ref::<Self>() else {
            return Err(JsNativeError::typ()
                .with_message("the this object must be a PlainDate object.")
                .into());
        };

        Ok(date.inner.day_of_week().into())
    }

    /// 3.3.11 get `Temporal.PlainDate.prototype.dayOfYear`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindate.prototype.dayofyear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/dayOfYear
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.day_of_year
    fn get_day_of_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let obj = this
            .as_object()
            .ok_or_else(|| JsNativeError::typ().with_message("this must be an object."))?;

        let Some(date) = obj.downcast_ref::<Self>() else {
            return Err(JsNativeError::typ()
                .with_message("the this object must be a PlainDate object.")
                .into());
        };

        Ok(date.inner.day_of_year().into())
    }

    /// 3.3.12 get `Temporal.PlainDate.prototype.weekOfYear`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindate.prototype.weekofyear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/weekOfYear
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.week_of_year
    fn get_week_of_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let obj = this
            .as_object()
            .ok_or_else(|| JsNativeError::typ().with_message("this must be an object."))?;

        let Some(date) = obj.downcast_ref::<Self>() else {
            return Err(JsNativeError::typ()
                .with_message("the this object must be a PlainDate object.")
                .into());
        };

        Ok(date.inner.week_of_year().into_or_undefined())
    }

    /// 3.3.13 get `Temporal.PlainDate.prototype.yearOfWeek`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindate.prototype.yearofweek
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/yearOfWeek
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.year_of_week
    fn get_year_of_week(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let obj = this
            .as_object()
            .ok_or_else(|| JsNativeError::typ().with_message("this must be an object."))?;

        let Some(date) = obj.downcast_ref::<Self>() else {
            return Err(JsNativeError::typ()
                .with_message("the this object must be a PlainDate object.")
                .into());
        };

        Ok(date.inner.year_of_week().into_or_undefined())
    }

    /// 3.3.14 get `Temporal.PlainDate.prototype.daysInWeek`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindate.prototype.daysinweek
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/daysInWeek
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.days_in_week
    fn get_days_in_week(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let obj = this
            .as_object()
            .ok_or_else(|| JsNativeError::typ().with_message("this must be an object."))?;

        let Some(date) = obj.downcast_ref::<Self>() else {
            return Err(JsNativeError::typ()
                .with_message("the this object must be a PlainDate object.")
                .into());
        };

        Ok(date.inner.days_in_week().into())
    }

    /// 3.3.15 get `Temporal.PlainDate.prototype.daysInMonth`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindate.prototype.daysinmonth
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/daysInMonth
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.days_in_month
    fn get_days_in_month(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let obj = this
            .as_object()
            .ok_or_else(|| JsNativeError::typ().with_message("this must be an object."))?;

        let Some(date) = obj.downcast_ref::<Self>() else {
            return Err(JsNativeError::typ()
                .with_message("the this object must be a PlainDate object.")
                .into());
        };

        Ok(date.inner.days_in_month().into())
    }

    /// 3.3.16 get `Temporal.PlainDate.prototype.daysInYear`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindate.prototype.daysinyear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/daysInYear
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.days_in_year
    fn get_days_in_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let obj = this
            .as_object()
            .ok_or_else(|| JsNativeError::typ().with_message("this must be an object."))?;

        let Some(date) = obj.downcast_ref::<Self>() else {
            return Err(JsNativeError::typ()
                .with_message("the this object must be a PlainDate object.")
                .into());
        };

        Ok(date.inner.days_in_year().into())
    }

    /// 3.3.17 get `Temporal.PlainDate.prototype.monthsInYear`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindate.prototype.monthsinyear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/monthsInYear
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.months_in_year
    fn get_months_in_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let obj = this
            .as_object()
            .ok_or_else(|| JsNativeError::typ().with_message("this must be an object."))?;

        let Some(date) = obj.downcast_ref::<Self>() else {
            return Err(JsNativeError::typ()
                .with_message("the this object must be a PlainDate object.")
                .into());
        };

        Ok(date.inner.months_in_year().into())
    }

    /// 3.3.18 get `Temporal.PlainDate.prototype.inLeapYear`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaindate.prototype.inleapyear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/inLeapYear
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.inLeapYear
    fn get_in_leap_year(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let obj = this
            .as_object()
            .ok_or_else(|| JsNativeError::typ().with_message("this must be an object."))?;

        let Some(date) = obj.downcast_ref::<Self>() else {
            return Err(JsNativeError::typ()
                .with_message("the this object must be a PlainDate object.")
                .into());
        };

        Ok(date.inner.in_leap_year().into())
    }
}

// ==== `PlainDate` static methods implementation ====

impl PlainDate {
    /// 3.2.2 `Temporal.PlainDate.from ( item [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindate.from
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/from
    fn from(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let item = args.get_or_undefined(0);
        let options = args.get(1);

        let object = item.as_object();
        if let Some(date) = object.as_ref().and_then(JsObject::downcast_ref::<Self>) {
            let options = get_options_object(options.unwrap_or(&JsValue::undefined()))?;
            let _ = get_option::<Overflow>(&options, js_string!("overflow"), context)?;
            return create_temporal_date(date.inner.clone(), None, context).map(Into::into);
        }

        let resolved_date = to_temporal_date(item, options.cloned(), context)?;
        create_temporal_date(resolved_date, None, context).map(Into::into)
    }

    /// 3.2.3 `Temporal.PlainDate.compare ( one, two )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindate.compare
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/compare
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.compare_iso
    fn compare(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let one = to_temporal_date(args.get_or_undefined(0), None, context)?;
        let two = to_temporal_date(args.get_or_undefined(1), None, context)?;

        Ok((one.compare_iso(&two) as i8).into())
    }
}

// ==== `PlainDate` method implementation ====

impl PlainDate {
    /// 3.3.19 `Temporal.PlainDate.toPlainYearMonth ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindate.prototype.toplainyearmonth
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/toPlainYearMonth
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.to_plain_year_month
    fn to_plain_year_month(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let temporalDate be the this value.
        // 2. Perform ? RequireInternalSlot(temporalDate, [[InitializedTemporalDate]]).
        let object = this.as_object();
        let date = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDate object.")
            })?;

        let year_month = date.inner.to_plain_year_month()?;
        create_temporal_year_month(year_month, None, context)
    }

    /// 3.3.20 `Temporal.PlainDate.toPlainMonthDay ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindate.prototype.toplainmonthday
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/toPlainMonthDay
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.to_plain_month_day
    fn to_plain_month_day(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let temporalDate be the this value.
        // 2. Perform ? RequireInternalSlot(temporalDate, [[InitializedTemporalDate]]).
        let object = this.as_object();
        let date = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDate object.")
            })?;

        let month_day = date.inner.to_plain_month_day()?;
        create_temporal_month_day(month_day, None, context)
    }

    /// 3.3.21 `Temporal.PlainDate.add ( temporalDurationLike [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindate.prototype.add
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/add
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.add
    fn add(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let temporalDate be the this value.
        // 2. Perform ? RequireInternalSlot(temporalDate, [[InitializedTemporalDate]]).
        let object = this.as_object();
        let date = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDate object.")
            })?;

        // 3. Let duration be ? ToTemporalDuration(temporalDurationLike).
        let duration = to_temporal_duration_record(args.get_or_undefined(0), context)?;

        // 4. Set options to ? GetOptionsObject(options).
        let options = get_options_object(args.get_or_undefined(1))?;

        let overflow = get_option::<Overflow>(&options, js_string!("overflow"), context)?;

        // 5. Let calendarRec be ? CreateCalendarMethodsRecord(temporalDate.[[Calendar]], « date-add »).
        // 6. Return ? AddDate(calendarRec, temporalDate, duration, options).
        let resolved_date = date.inner.add(&duration, overflow)?;
        create_temporal_date(resolved_date, None, context).map(Into::into)
    }

    /// 3.3.22 `Temporal.PlainDate.subtract ( temporalDurationLike [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindate.prototype.subtract
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/subtract
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.subtract
    fn subtract(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let temporalDate be the this value.
        // 2. Perform ? RequireInternalSlot(temporalDate, [[InitializedTemporalDate]]).
        let object = this.as_object();
        let date = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDate object.")
            })?;

        // 3. Let duration be ? ToTemporalDuration(temporalDurationLike).
        let duration = to_temporal_duration_record(args.get_or_undefined(0), context)?;

        // 4. Set options to ? GetOptionsObject(options).
        let options = get_options_object(args.get_or_undefined(1))?;
        let overflow = get_option::<Overflow>(&options, js_string!("overflow"), context)?;

        // 5. Let negatedDuration be CreateNegatedTemporalDuration(duration).
        // 6. Let calendarRec be ? CreateCalendarMethodsRecord(temporalDate.[[Calendar]], « date-add »).
        // 7. Return ? AddDate(calendarRec, temporalDate, negatedDuration, options).
        let resolved_date = date.inner.subtract(&duration, overflow)?;
        create_temporal_date(resolved_date, None, context).map(Into::into)
    }

    // 3.3.23 `Temporal.PlainDate.prototype.with ( temporalDateLike [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindate.prototype.with
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/with
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.with
    fn with(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let temporalDate be the this value.
        // 2. Perform ? RequireInternalSlot(temporalDate, [[InitializedTemporalDate]]).
        let object = this.as_object();
        let date = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDate object.")
            })?;

        // 3. If ? IsPartialTemporalObject(temporalDateLike) is false, throw a TypeError exception.
        let Some(partial_object) =
            super::is_partial_temporal_object(args.get_or_undefined(0), context)?
        else {
            return Err(JsNativeError::typ()
                .with_message("with object was not a PartialTemporalObject.")
                .into());
        };

        // SKIP: Steps 4-9 are handled by the with method of temporal_rs's Date
        // 4. Let calendar be temporalDate.[[Calendar]].
        // 5. Let fields be ISODateToFields(calendar, temporalDate.[[ISODate]], date).
        // 6. Let partialDate be ? PrepareCalendarFields(calendar, temporalDateLike, « year, month, month-code, day », « », partial).
        // 7. Set fields to CalendarMergeFields(calendar, fields, partialDate).
        let fields = to_calendar_fields(&partial_object, date.inner.calendar(), context)?;

        // 8. Let resolvedOptions be ? GetOptionsObject(options).
        let options = get_options_object(args.get_or_undefined(1))?;
        // 9. Let overflow be ? GetTemporalOverflowOption(resolvedOptions).
        let overflow = get_option::<Overflow>(&options, js_string!("overflow"), context)?;

        // 10. Return ? CalendarDateFromFields(calendarRec, fields, resolvedOptions).
        let resolved_date = date.inner.with(fields, overflow)?;
        create_temporal_date(resolved_date, None, context).map(Into::into)
    }

    // UPDATED: nekevss, 2025-07-21
    /// 3.3.24 `Temporal.PlainDate.prototype.withCalendar ( calendarLike )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindate.prototype.withcalendar
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/withCalendar
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.with_calendar
    fn with_calendar(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let plainDate be the this value.
        let object = this.as_object();
        // 2. Perform ? RequireInternalSlot(plainDate, [[InitializedTemporalDate]]).
        let date = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDate object.")
            })?;

        // 3. Let calendar be ? ToTemporalCalendarIdentifier(calendarLike).
        let calendar = to_temporal_calendar_identifier(args.get_or_undefined(0))?;
        // 4. Return ! CreateTemporalDate(plainDate.[[ISODate]], calendar).
        let resolved_date = date.inner.with_calendar(calendar);
        create_temporal_date(resolved_date, None, context).map(Into::into)
    }

    /// 3.3.25 `Temporal.PlainDate.prototype.until ( other [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindate.prototype.until
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/until
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.until
    fn until(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let temporalDate be the this value.
        // 2. Perform ? RequireInternalSlot(temporalDate, [[InitializedTemporalDate]]).
        let object = this.as_object();
        let date = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDate object.")
            })?;

        let other = to_temporal_date(args.get_or_undefined(0), None, context)?;

        // 3. Return ? DifferenceTemporalPlainDate(until, temporalDate, other, options).
        let options = get_options_object(args.get_or_undefined(1))?;
        let settings = get_difference_settings(&options, context)?;

        create_temporal_duration(date.inner.until(&other, settings)?, None, context).map(Into::into)
    }

    /// 3.3.26 `Temporal.PlainDate.prototype.since ( other [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindate.prototype.since
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/since
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.since
    fn since(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let temporalDate be the this value.
        // 2. Perform ? RequireInternalSlot(temporalDate, [[InitializedTemporalDate]]).
        let object = this.as_object();
        let date = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDate object.")
            })?;

        // 3. Return ? DifferenceTemporalPlainDate(since, temporalDate, other, options).
        let other = to_temporal_date(args.get_or_undefined(0), None, context)?;

        let options = get_options_object(args.get_or_undefined(1))?;
        let settings = get_difference_settings(&options, context)?;

        create_temporal_duration(date.inner.since(&other, settings)?, None, context).map(Into::into)
    }

    /// 3.3.27 `Temporal.PlainDate.prototype.equals ( other )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindate.prototype.equals
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/equals
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#impl-Eq-for-PlainDate
    fn equals(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let date = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDate object.")
            })?;

        let other = to_temporal_date(args.get_or_undefined(0), None, context)?;

        Ok((date.inner == other).into())
    }

    /// 3.3.28 `Temporal.PlainDate.prototype.toPlainDateTime ( [ temporalTime ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindate.prototype.toplaindatetime
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/toPlainDateTime
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.to_plain_date_time
    fn to_plain_date_time(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let temporalDate be the this value.
        // 2. Perform ? RequireInternalSlot(temporalDate, [[InitializedTemporalDate]]).
        let object = this.as_object();
        let date = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDate object.")
            })?;

        // 3. Set temporalTime to ? ToTemporalTimeOrMidnight(temporalTime).
        let time = args
            .get_or_undefined(0)
            .map(|v| to_temporal_time(v, None, context))
            .transpose()?;
        // 4. Return ? CreateTemporalDateTime(temporalDate.[[ISOYear]], temporalDate.[[ISOMonth]], temporalDate.[[ISODay]], temporalTime.[[ISOHour]], temporalTime.[[ISOMinute]], temporalTime.[[ISOSecond]], temporalTime.[[ISOMillisecond]], temporalTime.[[ISOMicrosecond]], temporalTime.[[ISONanosecond]], temporalDate.[[Calendar]]).
        create_temporal_datetime(date.inner.to_plain_date_time(time)?, None, context)
            .map(Into::into)
    }

    /// 3.3.29 `Temporal.PlainDate.prototype.toZonedDateTime ( item )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindate.prototype.tozoneddatetime
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/toZonedDateTime
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.to_zoned_date_time
    fn to_zoned_date_time(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let temporalDate be the this value.
        // 2. Perform ? RequireInternalSlot(temporalDate, [[InitializedTemporalDate]]).
        let object = this.as_object();
        let date = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDate object.")
            })?;

        let item = args.get_or_undefined(0);
        // 3. If item is an Object, then
        let (timezone, time) = if let Some(obj) = item.as_object() {
            // a. Let timeZoneLike be ? Get(item, "timeZone").
            let time_zone_like = obj.get(js_string!("timeZone"), context)?;
            // b. If timeZoneLike is undefined, then
            if time_zone_like.is_undefined() {
                // i. Let timeZone be ? ToTemporalTimeZoneIdentifier(item).
                // ii. Let temporalTime be undefined.
                (
                    to_temporal_timezone_identifier(&time_zone_like, context)?,
                    None,
                )
            // c. Else,
            } else {
                // i. Let timeZone be ? ToTemporalTimeZoneIdentifier(timeZoneLike).
                let tz = to_temporal_timezone_identifier(&time_zone_like, context)?;
                // ii. Let temporalTime be ? Get(item, "plainTime").
                let plain_time = obj
                    .get(js_string!("plainTime"), context)?
                    .map(|v| to_temporal_time(v, None, context))
                    .transpose()?;

                (tz, plain_time)
            }
        // 4. Else,
        } else {
            // a. Let timeZone be ? ToTemporalTimeZoneIdentifier(item).
            // b. Let temporalTime be undefined.
            (to_temporal_timezone_identifier(item, context)?, None)
        };

        let result = date.inner.to_zoned_date_time_with_provider(
            timezone,
            time,
            context.timezone_provider(),
        )?;

        // 7. Return ! CreateTemporalZonedDateTime(epochNs, timeZone, temporalDate.[[Calendar]]).
        create_temporal_zoneddatetime(result, None, context).map(Into::into)
    }

    /// 3.3.30 `Temporal.PlainDate.prototype.toString ( [ options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindate.prototype.tostring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/toString
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainDate.html#method.to_ixdtf_string
    fn to_string(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let date = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDate object.")
            })?;

        let options = get_options_object(args.get_or_undefined(0))?;
        let display_calendar =
            get_option::<DisplayCalendar>(&options, js_string!("calendarName"), context)?
                .unwrap_or(DisplayCalendar::Auto);
        Ok(JsString::from(date.inner.to_ixdtf_string(display_calendar)).into())
    }

    /// 3.3.31 `Temporal.PlainDate.prototype.toLocaleString ( [ locales [ , options ] ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindate.prototype.tolocalestring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/toLocaleString
    fn to_locale_string(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // TODO: Update for ECMA-402 compliance
        let object = this.as_object();
        let date = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDate object.")
            })?;

        Ok(JsString::from(date.inner.to_string()).into())
    }

    /// 3.3.32 `Temporal.PlainDate.prototype.toJSON ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindate.prototype.toJSON
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/toJSON
    fn to_json(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let date = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainDate object.")
            })?;

        Ok(JsString::from(date.inner.to_string()).into())
    }

    /// 3.3.33 `Temporal.PlainDate.prototype.valueOf ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaindate.prototype.valueof
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate/valueOf
    pub(crate) fn value_of(_this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Err(JsNativeError::typ()
            .with_message("`valueOf` not supported by Temporal built-ins. See 'compare', 'equals', or `toString`")
            .into())
    }
}

// ==== `PlainDate` Abstract Operations ====

/// 3.5.3 `CreateTemporalDate ( isoYear, isoMonth, isoDay, calendar [ , newTarget ] )`
pub(crate) fn create_temporal_date(
    inner: InnerDate,
    new_target: Option<&JsValue>,
    context: &mut Context,
) -> JsResult<JsObject> {
    // 1. If IsValidISODate(isoYear, isoMonth, isoDay) is false, throw a RangeError exception.
    // 2. If ISODateTimeWithinLimits(isoYear, isoMonth, isoDay, 12, 0, 0, 0, 0, 0) is false, throw a RangeError exception.

    // 3. If newTarget is not present, set newTarget to %Temporal.PlainDate%.
    let new_target = if let Some(new_target) = new_target {
        new_target.clone()
    } else {
        context
            .realm()
            .intrinsics()
            .constructors()
            .plain_date()
            .constructor()
            .into()
    };

    // 4. Let object be ? OrdinaryCreateFromConstructor(newTarget, "%Temporal.PlainDate.prototype%", « [[InitializedTemporalDate]], [[ISOYear]], [[ISOMonth]], [[ISODay]], [[Calendar]] »).
    let prototype =
        get_prototype_from_constructor(&new_target, StandardConstructors::plain_date, context)?;

    // 5. Set object.[[ISOYear]] to isoYear.
    // 6. Set object.[[ISOMonth]] to isoMonth.
    // 7. Set object.[[ISODay]] to isoDay.
    // 8. Set object.[[Calendar]] to calendar.
    let obj = JsObject::from_proto_and_data(prototype, PlainDate::new(inner));

    // 9. Return object.
    Ok(obj)
}

/// 3.5.4 `ToTemporalDate ( item [ , options ] )`
///
/// Converts an ambiguous `JsValue` into a `PlainDate`
pub(crate) fn to_temporal_date(
    item: &JsValue,
    options: Option<JsValue>,
    context: &mut Context,
) -> JsResult<InnerDate> {
    // 1. If options is not present, set options to undefined.
    let options = options.unwrap_or_default();

    // 2. Assert: Type(options) is Object or Undefined.
    // 3. If options is not undefined, set options to ? SnapshotOwnProperties(? GetOptionsObject(options), null).

    // 4. If Type(item) is Object, then
    if let Some(object) = item.as_object() {
        // a. If item has an [[InitializedTemporalDate]] internal slot, then
        if let Some(date) = object.downcast_ref::<PlainDate>() {
            let _options_obj = get_options_object(&options)?;
            return Ok(date.inner.clone());
        // b. If item has an [[InitializedTemporalZonedDateTime]] internal slot, then
        } else if let Some(zdt) = object.downcast_ref::<ZonedDateTime>() {
            let options_obj = get_options_object(&options)?;
            // i. Perform ? ToTemporalOverflow(options).
            let _overflow = get_option(&options_obj, js_string!("overflow"), context)?
                .unwrap_or(Overflow::Constrain);

            // ii. Let instant be ! CreateTemporalInstant(item.[[Nanoseconds]]).
            // iii. Let plainDateTime be ? GetPlainDateTimeFor(item.[[TimeZone]], instant, item.[[Calendar]]).
            // iv. Return ! CreateTemporalDate(plainDateTime.[[ISOYear]], plainDateTime.[[ISOMonth]], plainDateTime.[[ISODay]], plainDateTime.[[Calendar]]).
            return Ok(zdt.inner.to_plain_date());
        // c. If item has an [[InitializedTemporalDateTime]] internal slot, then
        } else if let Some(dt) = object.downcast_ref::<PlainDateTime>() {
            let options_obj = get_options_object(&options)?;
            // i. Perform ? ToTemporalOverflow(options).
            let _overflow = get_option(&options_obj, js_string!("overflow"), context)?
                .unwrap_or(Overflow::Constrain);

            let date = InnerDate::from(dt.inner.clone());

            // ii. Return ! CreateTemporalDate(item.[[ISOYear]], item.[[ISOMonth]], item.[[ISODay]], item.[[Calendar]]).
            return Ok(date);
        }
        // NOTE: d. is called in to_partial_date_record
        // d. Let calendar be ? GetTemporalCalendarIdentifierWithISODefault(item).
        // e. Let fields be ? PrepareCalendarFields(calendar, item, « year, month, month-code, day », «», «»).
        let partial = to_partial_date_record(&object, context)?;
        // f. Let resolvedOptions be ? GetOptionsObject(options).
        let resolved_options = get_options_object(&options)?;
        // g. Let overflow be ? GetTemporalOverflowOption(resolvedOptions).
        let overflow = get_option::<Overflow>(&resolved_options, js_string!("overflow"), context)?;
        // h. Let isoDate be ? CalendarDateFromFields(calendar, fields, overflow).
        // i. Return ! CreateTemporalDate(isoDate, calendar).
        return Ok(InnerDate::from_partial(partial, overflow)?);
    }

    // 5. If item is not a String, throw a TypeError exception.
    let Some(date_like_string) = item.as_string() else {
        return Err(JsNativeError::typ()
            .with_message("ToTemporalDate item must be an object or string.")
            .into());
    };

    // 4. Let result be ? ParseISODateTime(item, « TemporalDateTimeString[~Zoned] »).
    let result = date_like_string
        .to_std_string_escaped()
        .parse::<InnerDate>()
        .map_err(|err| JsNativeError::range().with_message(err.to_string()))?;

    // 5. Let calendar be result.[[Calendar]].
    // 6. If calendar is empty, set calendar to "iso8601".
    // 7. Set calendar to ? CanonicalizeCalendar(calendar).
    // 8. Let resolvedOptions be ? GetOptionsObject(options).
    let resolved_options = get_options_object(&options)?;
    // 9. Perform ? GetTemporalOverflowOption(resolvedOptions).
    let _overflow = get_option::<Overflow>(&resolved_options, js_string!("overflow"), context)?
        .unwrap_or(Overflow::Constrain);

    // 10. Let isoDate be CreateISODateRecord(result.[[Year]], result.[[Month]], result.[[Day]]).
    // 11. Return ? CreateTemporalDate(isoDate, calendar).
    Ok(result)
}

// TODO: For order of operations, `to_partial_date_record` may need to take a `Option<Calendar>` arg.
pub(crate) fn to_partial_date_record(
    partial_object: &JsObject,
    context: &mut Context,
) -> JsResult<PartialDate> {
    let calendar = get_temporal_calendar_slot_value_with_default(partial_object, context)?;
    // TODO: Most likely need to use an iterator to handle.
    let calendar_fields = to_calendar_fields(partial_object, &calendar, context)?;
    Ok(PartialDate {
        calendar_fields,
        calendar,
    })
}

pub(crate) fn to_calendar_fields(
    obj: &JsObject,
    calendar: &Calendar,
    context: &mut Context,
) -> JsResult<CalendarFields> {
    let day = obj
        .get(js_string!("day"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_positive_integer_with_truncation()
                .map_err(JsError::from)
        })
        .transpose()?;
    // TODO: `temporal_rs` needs a `has_era` method
    let has_no_era = calendar.kind() == AnyCalendarKind::Iso
        || calendar.kind() == AnyCalendarKind::Chinese
        || calendar.kind() == AnyCalendarKind::Dangi;
    let (era, era_year) = if has_no_era {
        (None, None)
    } else {
        let era = obj
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
        let era_year = obj
            .get(js_string!("eraYear"), context)?
            .map(|v| {
                let finite = v.to_finitef64(context)?;
                Ok::<i32, JsError>(finite.as_integer_with_truncation::<i32>())
            })
            .transpose()?;
        (era, era_year)
    };
    let month = obj
        .get(js_string!("month"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_positive_integer_with_truncation()
                .map_err(JsError::from)
        })
        .transpose()?;
    let month_code = obj
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
    let year = obj
        .get(js_string!("year"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            Ok::<i32, JsError>(finite.as_integer_with_truncation::<i32>())
        })
        .transpose()?;
    Ok(CalendarFields {
        year,
        month,
        month_code,
        day,
        era,
        era_year,
    })
}
