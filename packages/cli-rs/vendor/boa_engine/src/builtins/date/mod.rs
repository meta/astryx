//! Boa's implementation of ECMAScript's `Date` object.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!  - [MDN documentation][mdn]
//!
//! [spec]: https://tc39.es/ecma262/#sec-date-objects
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date

use crate::{
    Context, JsArgs, JsData, JsResult, JsString,
    builtins::{
        BuiltInBuilder, BuiltInConstructor, BuiltInObject, IntrinsicObject,
        date::utils::{
            MS_PER_MINUTE, date_from_time, date_string, day, hour_from_time, local_time, make_date,
            make_day, make_full_year, make_time, min_from_time, month_from_time, ms_from_time,
            pad_five, pad_four, pad_six, pad_three, pad_two, parse_date, sec_from_time, time_clip,
            time_string, time_within_day, time_zone_string, to_date_string_t, utc_t, week_day,
            year_from_time,
        },
    },
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    error::JsNativeError,
    js_string,
    object::{JsObject, internal_methods::get_prototype_from_constructor},
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
    symbol::JsSymbol,
    value::{JsValue, PreferredType},
};
use boa_gc::{Finalize, Trace};
use boa_macros::js_str;

#[cfg(feature = "intl")]
use crate::builtins::intl::date_time_format::{
    FormatDefaults, FormatType, create_date_time_format, format_timestamp_with_dtf,
};

pub(crate) mod utils;

#[cfg(test)]
mod tests;

/// The internal representation of a `Date` object.
#[derive(Debug, Copy, Clone, Trace, Finalize, JsData)]
#[boa_gc(empty_trace)]
pub struct Date(f64);

impl Date {
    /// Creates a new `Date`.
    pub(crate) const fn new(dt: f64) -> Self {
        Self(dt)
    }

    /// Creates a new `Date` from the current UTC time of the host.
    pub(crate) fn utc_now(context: &mut Context) -> Self {
        Self(context.clock().system_time_millis() as f64)
    }

    /// Formats this date as an ISO 8601 string for display purposes.
    ///
    /// Returns `None` if the date value is not finite (i.e. `Invalid Date`).
    pub(crate) fn to_iso_display(self) -> Option<String> {
        let tv = self.0;
        if !tv.is_finite() {
            return None;
        }
        let year = year_from_time(tv);
        let year_str = if year.is_positive() && year >= 10000 {
            format!("+{year:06}")
        } else if year >= 0 {
            format!("{year:04}")
        } else {
            format!("-{:06}", year.unsigned_abs())
        };
        Some(format!(
            "{}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
            year_str,
            month_from_time(tv) + 1,
            date_from_time(tv),
            hour_from_time(tv),
            min_from_time(tv),
            sec_from_time(tv),
            ms_from_time(tv),
        ))
    }
}

impl IntrinsicObject for Date {
    fn init(realm: &Realm) {
        let to_utc_string = BuiltInBuilder::callable(realm, Self::to_utc_string)
            .name(js_string!("toUTCString"))
            .length(0)
            .build();

        let to_primitive = BuiltInBuilder::callable(realm, Self::to_primitive)
            .name(js_string!("[Symbol.toPrimitive]"))
            .length(1)
            .build();

        let builder = BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .static_method(Self::now, js_string!("now"), 0)
            .static_method(Self::parse, js_string!("parse"), 1)
            .static_method(Self::utc, js_string!("UTC"), 7)
            .method(Self::get_date::<true>, js_string!("getDate"), 0)
            .method(Self::get_day::<true>, js_string!("getDay"), 0)
            .method(Self::get_full_year::<true>, js_string!("getFullYear"), 0)
            .method(Self::get_hours::<true>, js_string!("getHours"), 0)
            .method(
                Self::get_milliseconds::<true>,
                js_string!("getMilliseconds"),
                0,
            )
            .method(Self::get_minutes::<true>, js_string!("getMinutes"), 0)
            .method(Self::get_month::<true>, js_string!("getMonth"), 0)
            .method(Self::get_seconds::<true>, js_string!("getSeconds"), 0)
            .method(Self::get_time, js_string!("getTime"), 0)
            .method(
                Self::get_timezone_offset,
                js_string!("getTimezoneOffset"),
                0,
            )
            .method(Self::get_date::<false>, js_string!("getUTCDate"), 0)
            .method(Self::get_day::<false>, js_string!("getUTCDay"), 0)
            .method(
                Self::get_full_year::<false>,
                js_string!("getUTCFullYear"),
                0,
            )
            .method(Self::get_hours::<false>, js_string!("getUTCHours"), 0)
            .method(
                Self::get_milliseconds::<false>,
                js_string!("getUTCMilliseconds"),
                0,
            )
            .method(Self::get_minutes::<false>, js_string!("getUTCMinutes"), 0)
            .method(Self::get_month::<false>, js_string!("getUTCMonth"), 0)
            .method(Self::get_seconds::<false>, js_string!("getUTCSeconds"), 0)
            .method(Self::get_year, js_string!("getYear"), 0)
            .method(Self::set_date::<true>, js_string!("setDate"), 1)
            .method(Self::set_full_year::<true>, js_string!("setFullYear"), 3)
            .method(Self::set_hours::<true>, js_string!("setHours"), 4)
            .method(
                Self::set_milliseconds::<true>,
                js_string!("setMilliseconds"),
                1,
            )
            .method(Self::set_minutes::<true>, js_string!("setMinutes"), 3)
            .method(Self::set_month::<true>, js_string!("setMonth"), 2)
            .method(Self::set_seconds::<true>, js_string!("setSeconds"), 2)
            .method(Self::set_time, js_string!("setTime"), 1)
            .method(Self::set_date::<false>, js_string!("setUTCDate"), 1)
            .method(
                Self::set_full_year::<false>,
                js_string!("setUTCFullYear"),
                3,
            )
            .method(Self::set_hours::<false>, js_string!("setUTCHours"), 4)
            .method(
                Self::set_milliseconds::<false>,
                js_string!("setUTCMilliseconds"),
                1,
            )
            .method(Self::set_minutes::<false>, js_string!("setUTCMinutes"), 3)
            .method(Self::set_month::<false>, js_string!("setUTCMonth"), 2)
            .method(Self::set_seconds::<false>, js_string!("setUTCSeconds"), 2)
            .method(Self::set_year, js_string!("setYear"), 1)
            .method(Self::to_date_string, js_string!("toDateString"), 0)
            .method(Self::to_iso_string, js_string!("toISOString"), 0)
            .method(Self::to_json, js_string!("toJSON"), 1)
            .method(
                Self::to_locale_date_string,
                js_string!("toLocaleDateString"),
                0,
            )
            .method(Self::to_locale_string, js_string!("toLocaleString"), 0)
            .method(
                Self::to_locale_time_string,
                js_string!("toLocaleTimeString"),
                0,
            )
            .method(Self::to_string, js_string!("toString"), 0)
            .method(Self::to_time_string, js_string!("toTimeString"), 0)
            .method(Self::value_of, js_string!("valueOf"), 0)
            .property(
                js_string!("toGMTString"),
                to_utc_string.clone(),
                Attribute::WRITABLE | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .property(
                js_string!("toUTCString"),
                to_utc_string,
                Attribute::WRITABLE | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .property(
                JsSymbol::to_primitive(),
                to_primitive,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            );

        #[cfg(feature = "temporal")]
        let builder = builder.method(
            Self::to_temporal_instant,
            js_string!("toTemporalInstant"),
            0,
        );

        builder.build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInObject for Date {
    const NAME: JsString = StaticJsStrings::DATE;
}

impl BuiltInConstructor for Date {
    const CONSTRUCTOR_ARGUMENTS: usize = 7;
    const PROTOTYPE_STORAGE_SLOTS: usize = 48;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 3;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::date;

    /// [`Date ( ...values )`][spec]
    ///
    /// - When called as a function, returns a string displaying the current time in the UTC timezone.
    /// - When called as a constructor, it returns a new `Date` object from the provided arguments.
    ///   The [MDN documentation][mdn] has a more extensive explanation on the usages and return
    ///   values for all possible arguments.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-date-constructor
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/Date
    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is undefined, then
        if new_target.is_undefined() {
            // a. Let now be the time value (UTC) identifying the current time.
            let now = context.clock().system_time_millis();

            // b. Return ToDateString(now).
            return Ok(JsValue::from(to_date_string_t(
                now as f64,
                context.host_hooks().as_ref(),
            )));
        }

        // 2. Let numberOfArgs be the number of elements in values.
        let dv = match args {
            // 3. If numberOfArgs = 0, then
            [] => {
                // a. Let dv be the time value (UTC) identifying the current time.
                Self::utc_now(context)
            }
            // 4. Else if numberOfArgs = 1, then
            // a. Let value be values[0].
            [value] => {
                // b. If value is an Object and value has a [[DateValue]] internal slot, then
                let object = value.as_object();
                let tv =
                    if let Some(date) = object.as_ref().and_then(JsObject::downcast_ref::<Self>) {
                        // i. Let tv be value.[[DateValue]].
                        date.0
                    }
                    // c. Else,
                    else {
                        // i. Let v be ? ToPrimitive(value).
                        let v = value.to_primitive(context, PreferredType::Default)?;

                        // ii. If v is a String, then
                        if let Some(v) = v.as_string() {
                            // 1. Assert: The next step never returns an abrupt completion because v is a String.
                            // 2. Let tv be the result of parsing v as a date, in exactly the same manner as for the parse method (21.4.3.2).
                            let tv = parse_date(&v, context.host_hooks().as_ref());
                            if let Some(tv) = tv {
                                tv as f64
                            } else {
                                f64::NAN
                            }
                        }
                        // iii. Else,
                        else {
                            // 1. Let tv be ? ToNumber(v).
                            v.to_number(context)?
                        }
                    };

                // d. Let dv be TimeClip(tv).
                Self(time_clip(tv))
            }
            // 5. Else,
            _ => {
                // Separating this into its own function to simplify the logic.
                //let dt = Self::construct_date(args, context)?
                //    .and_then(|dt| context.host_hooks().local_from_naive_local(dt).earliest());
                //Self(dt.map(|dt| dt.timestamp_millis()))

                // a. Assert: numberOfArgs ≥ 2.
                // b. Let y be ? ToNumber(values[0]).
                let y = args.get_or_undefined(0).to_number(context)?;

                // c. Let m be ? ToNumber(values[1]).
                let m = args.get_or_undefined(1).to_number(context)?;

                // d. If numberOfArgs > 2, let dt be ? ToNumber(values[2]); else let dt be 1𝔽.
                let dt = args.get(2).map_or(Ok(1.0), |n| n.to_number(context))?;

                // e. If numberOfArgs > 3, let h be ? ToNumber(values[3]); else let h be +0𝔽.
                let h = args.get(3).map_or(Ok(0.0), |n| n.to_number(context))?;

                // f. If numberOfArgs > 4, let min be ? ToNumber(values[4]); else let min be +0𝔽.
                let min = args.get(4).map_or(Ok(0.0), |n| n.to_number(context))?;

                // g. If numberOfArgs > 5, let s be ? ToNumber(values[5]); else let s be +0𝔽.
                let s = args.get(5).map_or(Ok(0.0), |n| n.to_number(context))?;

                // h. If numberOfArgs > 6, let milli be ? ToNumber(values[6]); else let milli be +0𝔽.
                let milli = args.get(6).map_or(Ok(0.0), |n| n.to_number(context))?;

                // i. Let yr be MakeFullYear(y).
                let yr = make_full_year(y);

                // j. Let finalDate be MakeDate(MakeDay(yr, m, dt), MakeTime(h, min, s, milli)).
                let final_date = make_date(make_day(yr, m, dt), make_time(h, min, s, milli));

                // k. Let dv be TimeClip(UTC(finalDate)).
                Self(time_clip(utc_t(final_date, context.host_hooks().as_ref())))
            }
        };

        // 6. Let O be ? OrdinaryCreateFromConstructor(NewTarget, "%Date.prototype%", « [[DateValue]] »).
        let prototype =
            get_prototype_from_constructor(new_target, StandardConstructors::date, context)?;

        // 7. Set O.[[DateValue]] to dv.
        let obj =
            JsObject::from_proto_and_data_with_shared_shape(context.root_shape(), prototype, dv);

        // 8. Return O.
        Ok(obj.into())
    }
}

impl Date {
    /// `Date.now()`
    ///
    /// The static `Date.now()` method returns the number of milliseconds elapsed since January 1, 1970 00:00:00 UTC.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-date.now
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/now
    #[allow(clippy::unnecessary_wraps)]
    pub(crate) fn now(_: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        Ok(JsValue::new(context.clock().system_time_millis()))
    }

    /// `Date.parse()`
    ///
    /// The `Date.parse()` method parses a string representation of a date, and returns the number of milliseconds since
    /// January 1, 1970, 00:00:00 UTC or `NaN` if the string is unrecognized or, in some cases, contains illegal date
    /// values.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-date.parse
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/parse
    pub(crate) fn parse(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let date = args.get_or_undefined(0).to_string(context)?;
        Ok(parse_date(&date, context.host_hooks().as_ref())
            .map_or(JsValue::from(f64::NAN), JsValue::from))
    }

    /// `Date.UTC()`
    ///
    /// The `Date.UTC()` method accepts parameters similar to the `Date` constructor, but treats them as UTC.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-date.utc
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/UTC
    pub(crate) fn utc(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let y be ? ToNumber(year).
        let y = args.get_or_undefined(0).to_number(context)?;

        // 2. If month is present, let m be ? ToNumber(month); else let m be +0𝔽.
        let m = args
            .get(1)
            .map_or(Ok(0f64), |value| value.to_number(context))?;

        // 3. If date is present, let dt be ? ToNumber(date); else let dt be 1𝔽.
        let dt = args
            .get(2)
            .map_or(Ok(1f64), |value| value.to_number(context))?;

        // 4. If hours is present, let h be ? ToNumber(hours); else let h be +0𝔽.
        let h = args
            .get(3)
            .map_or(Ok(0f64), |value| value.to_number(context))?;

        // 5. If minutes is present, let min be ? ToNumber(minutes); else let min be +0𝔽.
        let min = args
            .get(4)
            .map_or(Ok(0f64), |value| value.to_number(context))?;

        // 6. If seconds is present, let s be ? ToNumber(seconds); else let s be +0𝔽.
        let s = args
            .get(5)
            .map_or(Ok(0f64), |value| value.to_number(context))?;

        // 7. If ms is present, let milli be ? ToNumber(ms); else let milli be +0𝔽.
        let milli = args
            .get(6)
            .map_or(Ok(0f64), |value| value.to_number(context))?;

        // 8. Let yr be MakeFullYear(y).
        let yr = make_full_year(y);

        // 9. Return TimeClip(MakeDate(MakeDay(yr, m, dt), MakeTime(h, min, s, milli))).
        Ok(JsValue::from(time_clip(make_date(
            make_day(yr, m, dt),
            make_time(h, min, s, milli),
        ))))
    }

    /// [`Date.prototype.getDate ( )`][local] and
    /// [`Date.prototype.getUTCDate ( )`][utc].
    ///
    /// The `getDate()` method returns the day of the month for the specified date.
    ///
    /// [local]: https://tc39.es/ecma262/#sec-date.prototype.getdate
    /// [utc]: https://tc39.es/ecma262/#sec-date.prototype.getutcdate
    pub(crate) fn get_date<const LOCAL: bool>(
        this: &JsValue,
        _args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        // 3. Let t be dateObject.[[DateValue]].
        let t = this
            .as_object()
            .and_then(|obj| obj.downcast_ref::<Date>().as_deref().copied())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?
            .0;

        // 4. If t is NaN, return NaN.
        if t.is_nan() {
            return Ok(JsValue::new(f64::NAN));
        }

        if LOCAL {
            // 5. Return DateFromTime(LocalTime(t)).
            Ok(JsValue::from(date_from_time(local_time(
                t,
                context.host_hooks().as_ref(),
            ))))
        } else {
            // 5. Return DateFromTime(t).
            Ok(JsValue::from(date_from_time(t)))
        }
    }

    /// [`Date.prototype.getDay ( )`][local] and
    /// [`Date.prototype.getUTCDay ( )`][utc].
    ///
    /// The `getDay()` method returns the day of the week for the specified date, where 0 represents
    /// Sunday.
    ///
    /// [local]: https://tc39.es/ecma262/#sec-date.prototype.getday
    /// [utc]: https://tc39.es/ecma262/#sec-date.prototype.getutcday
    pub(crate) fn get_day<const LOCAL: bool>(
        this: &JsValue,
        _args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        // 3. Let t be dateObject.[[DateValue]].
        let t = this
            .as_object()
            .and_then(|obj| obj.downcast_ref::<Date>().as_deref().copied())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?
            .0;

        // 4. If t is NaN, return NaN.
        if t.is_nan() {
            return Ok(JsValue::from(f64::NAN));
        }

        if LOCAL {
            // 5. Return WeekDay(LocalTime(t)).
            Ok(JsValue::from(week_day(local_time(
                t,
                context.host_hooks().as_ref(),
            ))))
        } else {
            // 5. Return WeekDay(t).
            Ok(JsValue::from(week_day(t)))
        }
    }

    /// [`Date.prototype.getYear()`][spec].
    ///
    /// The `getYear()` method returns the year in the specified date according to local time.
    /// Because `getYear()` does not return full years ("year 2000 problem"), it is no longer used
    /// and has been replaced by the `getFullYear()` method.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-date.prototype.getyear
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getYear
    pub(crate) fn get_year(
        this: &JsValue,
        _args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        // 3. Let t be dateObject.[[DateValue]].
        let t = this
            .as_object()
            .and_then(|obj| obj.downcast_ref::<Date>().as_deref().copied())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?
            .0;

        // 4. If t is NaN, return NaN.
        if t.is_nan() {
            return Ok(JsValue::from(f64::NAN));
        }

        // 5. Return YearFromTime(LocalTime(t)) - 1900𝔽.
        Ok(JsValue::from(
            year_from_time(local_time(t, context.host_hooks().as_ref())) - 1900,
        ))
    }

    /// [`Date.prototype.getFullYear ( )`][local] and
    /// [`Date.prototype.getUTCFullYear ( )`][utc].
    ///
    /// The `getFullYear()` method returns the year of the specified date.
    ///
    /// [local]: https://tc39.es/ecma262/#sec-date.prototype.getfullyear
    /// [utc]: https://tc39.es/ecma262/#sec-date.prototype.getutcfullyear
    pub(crate) fn get_full_year<const LOCAL: bool>(
        this: &JsValue,
        _args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        // 3. Let t be dateObject.[[DateValue]].
        let t = this
            .as_object()
            .and_then(|obj| obj.downcast_ref::<Date>().as_deref().copied())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?
            .0;

        // 4. If t is NaN, return NaN.
        if t.is_nan() {
            return Ok(JsValue::from(f64::NAN));
        }

        if LOCAL {
            // 5. Return YearFromTime(LocalTime(t)).
            Ok(JsValue::from(year_from_time(local_time(
                t,
                context.host_hooks().as_ref(),
            ))))
        } else {
            // 5. Return YearFromTime(t).
            Ok(JsValue::from(year_from_time(t)))
        }
    }

    /// [`Date.prototype.getHours ( )`][local] and
    /// [`Date.prototype.getUTCHours ( )`][utc].
    ///
    /// The `getHours()` method returns the hour for the specified date.
    ///
    /// [local]: https://tc39.es/ecma262/#sec-date.prototype.gethours
    /// [utc]: https://tc39.es/ecma262/#sec-date.prototype.getutchours
    pub(crate) fn get_hours<const LOCAL: bool>(
        this: &JsValue,
        _args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        // 3. Let t be dateObject.[[DateValue]].
        let t = this
            .as_object()
            .and_then(|obj| obj.downcast_ref::<Date>().as_deref().copied())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?
            .0;

        // 4. If t is NaN, return NaN.
        if t.is_nan() {
            return Ok(JsValue::from(f64::NAN));
        }

        if LOCAL {
            // 5. Return HourFromTime(LocalTime(t)).
            Ok(JsValue::from(hour_from_time(local_time(
                t,
                context.host_hooks().as_ref(),
            ))))
        } else {
            // 5. Return HourFromTime(t).
            Ok(JsValue::from(hour_from_time(t)))
        }
    }

    /// [`Date.prototype.getMilliseconds ( )`][local] and
    /// [`Date.prototype.getUTCMilliseconds ( )`][utc].
    ///
    /// The `getMilliseconds()` method returns the milliseconds in the specified date.
    ///
    /// [local]: https://tc39.es/ecma262/#sec-date.prototype.getmilliseconds
    /// [utc]: https://tc39.es/ecma262/#sec-date.prototype.getutcmilliseconds
    pub(crate) fn get_milliseconds<const LOCAL: bool>(
        this: &JsValue,
        _args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        // 3. Let t be dateObject.[[DateValue]].
        let t = this
            .as_object()
            .and_then(|obj| obj.downcast_ref::<Date>().as_deref().copied())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?
            .0;

        // 4. If t is NaN, return NaN.
        if t.is_nan() {
            return Ok(JsValue::from(f64::NAN));
        }

        if LOCAL {
            // 5. Return msFromTime(LocalTime(t)).
            Ok(JsValue::from(ms_from_time(local_time(
                t,
                context.host_hooks().as_ref(),
            ))))
        } else {
            // 5. Return msFromTime(t).
            Ok(JsValue::from(ms_from_time(t)))
        }
    }

    /// [`Date.prototype.getMinutes ( )`][local] and
    /// [`Date.prototype.getUTCMinutes ( )`][utc].
    ///
    /// The `getMinutes()` method returns the minutes in the specified date.
    ///
    /// [local]: https://tc39.es/ecma262/#sec-date.prototype.getminutes
    /// [utc]: https://tc39.es/ecma262/#sec-date.prototype.getutcminutes
    pub(crate) fn get_minutes<const LOCAL: bool>(
        this: &JsValue,
        _args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        // 3. Let t be dateObject.[[DateValue]].
        let t = this
            .as_object()
            .and_then(|obj| obj.downcast_ref::<Date>().as_deref().copied())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?
            .0;

        // 4. If t is NaN, return NaN.
        if t.is_nan() {
            return Ok(JsValue::from(f64::NAN));
        }

        if LOCAL {
            // 5. Return MinFromTime(LocalTime(t)).
            Ok(JsValue::from(min_from_time(local_time(
                t,
                context.host_hooks().as_ref(),
            ))))
        } else {
            // 5. Return MinFromTime(t).
            Ok(JsValue::from(min_from_time(t)))
        }
    }

    /// [`Date.prototype.getMonth ( )`][local] and
    /// [`Date.prototype.getUTCMonth ( )`][utc].
    ///
    /// The `getMonth()` method returns the month in the specified date, as a zero-based value
    /// (where zero indicates the first month of the year).
    ///
    /// [local]: https://tc39.es/ecma262/#sec-date.prototype.getmonth
    /// [utc]: https://tc39.es/ecma262/#sec-date.prototype.getutcmonth
    pub(crate) fn get_month<const LOCAL: bool>(
        this: &JsValue,
        _args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        // 3. Let t be dateObject.[[DateValue]].
        let t = this
            .as_object()
            .and_then(|obj| obj.downcast_ref::<Date>().as_deref().copied())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?
            .0;

        // 4. If t is NaN, return NaN.
        if t.is_nan() {
            return Ok(JsValue::from(f64::NAN));
        }

        if LOCAL {
            // 5. Return MonthFromTime(LocalTime(t)).
            Ok(JsValue::from(month_from_time(local_time(
                t,
                context.host_hooks().as_ref(),
            ))))
        } else {
            // 5. Return MonthFromTime(t).
            Ok(JsValue::from(month_from_time(t)))
        }
    }

    /// [`Date.prototype.getSeconds ( )`][local] and
    /// [`Date.prototype.getUTCSeconds ( )`][utc].
    ///
    /// The `getSeconds()` method returns the seconds in the specified date.
    ///
    /// [local]: https://tc39.es/ecma262/#sec-date.prototype.getseconds
    /// [utc]: https://tc39.es/ecma262/#sec-date.prototype.getutcseconds
    pub(crate) fn get_seconds<const LOCAL: bool>(
        this: &JsValue,
        _args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        // 3. Let t be dateObject.[[DateValue]].
        let t = this
            .as_object()
            .and_then(|obj| obj.downcast_ref::<Date>().as_deref().copied())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?
            .0;

        // 4. If t is NaN, return NaN.
        if t.is_nan() {
            return Ok(JsValue::from(f64::NAN));
        }

        if LOCAL {
            // 5. Return SecFromTime(LocalTime(t)).
            Ok(JsValue::from(sec_from_time(local_time(
                t,
                context.host_hooks().as_ref(),
            ))))
        } else {
            // 5. Return SecFromTime(t).
            Ok(JsValue::from(sec_from_time(t)))
        }
    }

    /// `Date.prototype.getTime()`.
    ///
    /// The `getTime()` method returns the number of milliseconds since the Unix Epoch.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-date.prototype.gettime
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTime
    pub(crate) fn get_time(
        this: &JsValue,
        _args: &[JsValue],
        _context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        // 3. Return dateObject.[[DateValue]].
        Ok(this
            .as_object()
            .and_then(|obj| obj.downcast_ref::<Date>().as_deref().copied())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?
            .0
            .into())
    }

    /// `Date.prototype.getTimeZoneOffset()`.
    ///
    /// The `getTimezoneOffset()` method returns the time zone difference, in minutes, from current locale (host system
    /// settings) to UTC.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-date.prototype.gettimezoneoffset
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTimezoneOffset
    pub(crate) fn get_timezone_offset(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        // 3. Let t be dateObject.[[DateValue]].
        let t = this
            .as_object()
            .and_then(|obj| obj.downcast_ref::<Date>().as_deref().copied())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?
            .0;

        // 4. If t is NaN, return NaN.
        if t.is_nan() {
            return Ok(JsValue::from(f64::NAN));
        }

        // 5. Return (t - LocalTime(t)) / msPerMinute.
        Ok(JsValue::from(
            (t - local_time(t, context.host_hooks().as_ref())) / MS_PER_MINUTE,
        ))
    }

    /// [`Date.prototype.setDate ( date )`][local] and
    /// [`Date.prototype.setUTCDate ( date )`][utc].
    ///
    /// The `setDate()` method sets the day of the `Date` object relative to the beginning of the
    /// currently set month.
    ///
    /// [local]: https://tc39.es/ecma262/#sec-date.prototype.setdate
    /// [utc]: https://tc39.es/ecma262/#sec-date.prototype.setutcdate
    pub(crate) fn set_date<const LOCAL: bool>(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        let object = this.as_object();
        let date = object
            .and_then(|o| o.downcast::<Date>().ok())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?;

        // 3. Let t be dateObject.[[DateValue]].
        let mut t = date.borrow().data().0;

        // 4. Let dt be ? ToNumber(date).
        let dt = args.get_or_undefined(0).to_number(context)?;

        // 5. If t is NaN, return NaN.
        if t.is_nan() {
            return Ok(JsValue::from(f64::NAN));
        }

        if LOCAL {
            // 6. Set t to LocalTime(t).
            t = local_time(t, context.host_hooks().as_ref());
        }

        // 7. Let newDate be MakeDate(MakeDay(YearFromTime(t), MonthFromTime(t), dt), TimeWithinDay(t)).
        let new_date = make_date(
            make_day(year_from_time(t).into(), month_from_time(t).into(), dt),
            time_within_day(t),
        );

        let u = if LOCAL {
            // 8. Let u be TimeClip(UTC(newDate)).
            time_clip(utc_t(new_date, context.host_hooks().as_ref()))
        } else {
            // 8. Let v be TimeClip(newDate).
            time_clip(new_date)
        };

        // 9. Set dateObject.[[DateValue]] to u.
        date.borrow_mut().data_mut().0 = u;

        // 10. Return u.
        Ok(JsValue::from(u))
    }

    /// [`Date.prototype.setFullYear ( year [ , month [ , date ] ] )`][local] and
    /// [Date.prototype.setUTCFullYear ( year [ , month [ , date ] ] )][utc].
    ///
    /// The `setFullYear()` method sets the full year for a specified date and returns the new
    /// timestamp.
    ///
    /// [local]: https://tc39.es/ecma262/#sec-date.prototype.setfullyear
    /// [utc]: https://tc39.es/ecma262/#sec-date.prototype.setutcfullyear
    pub(crate) fn set_full_year<const LOCAL: bool>(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        let object = this.as_object();

        let date = object
            .and_then(|o| o.downcast::<Date>().ok())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?;

        // 3. Let t be dateObject.[[DateValue]].
        let t = date.borrow().data().0;

        let t = if LOCAL {
            // 5. If t is NaN, set t to +0𝔽; otherwise, set t to LocalTime(t).
            if t.is_nan() {
                0.0
            } else {
                local_time(t, context.host_hooks().as_ref())
            }
        } else {
            // 4. If t is NaN, set t to +0𝔽.
            if t.is_nan() { 0.0 } else { t }
        };

        // 4. Let y be ? ToNumber(year).
        let y = args.get_or_undefined(0).to_number(context)?;

        // 6. If month is not present, let m be MonthFromTime(t); otherwise, let m be ? ToNumber(month).
        let m = if let Some(month) = args.get(1) {
            month.to_number(context)?
        } else {
            month_from_time(t).into()
        };

        // 7. If date is not present, let dt be DateFromTime(t); otherwise, let dt be ? ToNumber(date).
        let dt = if let Some(date) = args.get(2) {
            date.to_number(context)?
        } else {
            date_from_time(t).into()
        };

        // 8. Let newDate be MakeDate(MakeDay(y, m, dt), TimeWithinDay(t)).
        let new_date = make_date(make_day(y, m, dt), time_within_day(t));

        let u = if LOCAL {
            // 9. Let u be TimeClip(UTC(newDate)).
            time_clip(utc_t(new_date, context.host_hooks().as_ref()))
        } else {
            // 9. Let u be TimeClip(newDate).
            time_clip(new_date)
        };

        // 10. Set dateObject.[[DateValue]] to u.
        date.borrow_mut().data_mut().0 = u;

        // 11. Return u.
        Ok(JsValue::from(u))
    }

    /// [`Date.prototype.setHours ( hour [ , min [ , sec [ , ms ] ] ] )`][local] and
    /// [`Date.prototype.setUTCHours ( hour [ , min [ , sec [ , ms ] ] ] )`][utc].
    ///
    /// The `setHours()` method sets the hours for a specified date, and returns the number
    /// of milliseconds since January 1, 1970 00:00:00 UTC until the time represented by the
    /// updated `Date` instance.
    ///
    /// [local]: https://tc39.es/ecma262/#sec-date.prototype.sethours
    /// [utc]: https://tc39.es/ecma262/#sec-date.prototype.setutchours
    #[allow(clippy::many_single_char_names)]
    pub(crate) fn set_hours<const LOCAL: bool>(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        let object = this.as_object();
        let date = object
            .and_then(|o| o.downcast::<Date>().ok())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?;

        // 3. Let t be dateObject.[[DateValue]].
        let mut t = date.borrow().data().0;

        // 4. Let h be ? ToNumber(hour).
        let h = args.get_or_undefined(0).to_number(context)?;

        // 5. If min is present, let m be ? ToNumber(min).
        let m = args.get(1).map(|v| v.to_number(context)).transpose()?;

        // 6. If sec is present, let s be ? ToNumber(sec).
        let s = args.get(2).map(|v| v.to_number(context)).transpose()?;

        // 7. If ms is present, let milli be ? ToNumber(ms).
        let milli = args.get(3).map(|v| v.to_number(context)).transpose()?;

        // 8. If t is NaN, return NaN.
        if t.is_nan() {
            return Ok(JsValue::from(f64::NAN));
        }

        if LOCAL {
            // 9. Set t to LocalTime(t).
            t = local_time(t, context.host_hooks().as_ref());
        }

        // 10. If min is not present, let m be MinFromTime(t).
        let m: f64 = m.unwrap_or_else(|| min_from_time(t).into());

        // 11. If sec is not present, let s be SecFromTime(t).
        let s = s.unwrap_or_else(|| sec_from_time(t).into());

        // 12. If ms is not present, let milli be msFromTime(t).
        let milli = milli.unwrap_or_else(|| ms_from_time(t).into());

        // 13. Let date be MakeDate(Day(t), MakeTime(h, m, s, milli)).
        let dt = make_date(day(t), make_time(h, m, s, milli));

        let u = if LOCAL {
            // 14. Let u be TimeClip(UTC(date)).
            time_clip(utc_t(dt, context.host_hooks().as_ref()))
        } else {
            // 14. Let u be TimeClip(date).
            time_clip(dt)
        };

        // 15. Set dateObject.[[DateValue]] to u.
        date.borrow_mut().data_mut().0 = u;

        // 16. Return u.
        Ok(JsValue::from(u))
    }

    /// [`Date.prototype.setMilliseconds ( ms )`[local] and
    /// [`Date.prototype.setUTCMilliseconds ( ms )`][utc].
    ///
    /// The `setMilliseconds()` method sets the milliseconds for a specified date according to local time.
    ///
    /// [local]: https://tc39.es/ecma262/#sec-date.prototype.setmilliseconds
    /// [utc]: https://tc39.es/ecma262/#sec-date.prototype.setutcmilliseconds
    pub(crate) fn set_milliseconds<const LOCAL: bool>(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        let object = this.as_object();
        let date = object
            .and_then(|o| o.downcast::<Date>().ok())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?;

        // 3. Let t be dateObject.[[DateValue]].
        let mut t = date.borrow().data().0;

        // 4. Set ms to ? ToNumber(ms).
        let ms = args.get_or_undefined(0).to_number(context)?;

        // 5. If t is NaN, return NaN.
        if t.is_nan() {
            return Ok(JsValue::from(f64::NAN));
        }

        if LOCAL {
            // 6. Set t to LocalTime(t).
            t = local_time(t, context.host_hooks().as_ref());
        }

        // 7. Let time be MakeTime(HourFromTime(t), MinFromTime(t), SecFromTime(t), ms).
        let time = make_time(
            hour_from_time(t).into(),
            min_from_time(t).into(),
            sec_from_time(t).into(),
            ms,
        );

        let u = if LOCAL {
            // 8. Let u be TimeClip(UTC(MakeDate(Day(t), time))).
            time_clip(utc_t(
                make_date(day(t), time),
                context.host_hooks().as_ref(),
            ))
        } else {
            // 8. Let u be TimeClip(MakeDate(Day(t), time)).
            time_clip(make_date(day(t), time))
        };

        // 9. Set dateObject.[[DateValue]] to u.
        date.borrow_mut().data_mut().0 = u;

        // 10. Return u.
        Ok(JsValue::from(u))
    }

    /// [`Date.prototype.setMinutes ( min [ , sec [ , ms ] ] )`][local] and
    /// [`Date.prototype.setUTCMinutes ( min [ , sec [ , ms ] ] )`][utc].
    ///
    /// The `setMinutes()` method sets the minutes for a specified date.
    ///
    /// [local]: https://tc39.es/ecma262/#sec-date.prototype.setminutes
    /// [utc]: https://tc39.es/ecma262/#sec-date.prototype.setutcminutes
    pub(crate) fn set_minutes<const LOCAL: bool>(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        let object = this.as_object();
        let date = object
            .and_then(|o| o.downcast::<Date>().ok())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?;

        // 3. Let t be dateObject.[[DateValue]].
        let mut t = date.borrow().data().0;

        // 4. Let m be ? ToNumber(min).
        let m = args.get_or_undefined(0).to_number(context)?;

        // 5. If sec is present, let s be ? ToNumber(sec).
        let s = args.get(1).map(|v| v.to_number(context)).transpose()?;

        // 6. If ms is present, let milli be ? ToNumber(ms).
        let milli = args.get(2).map(|v| v.to_number(context)).transpose()?;

        // 7. If t is NaN, return NaN.
        if t.is_nan() {
            return Ok(JsValue::from(f64::NAN));
        }

        if LOCAL {
            // 8. Set t to LocalTime(t).
            t = local_time(t, context.host_hooks().as_ref());
        }

        // 9. If sec is not present, let s be SecFromTime(t).
        let s = s.unwrap_or_else(|| sec_from_time(t).into());

        // 10. If ms is not present, let milli be msFromTime(t).
        let milli = milli.unwrap_or_else(|| ms_from_time(t).into());

        // 11. Let date be MakeDate(Day(t), MakeTime(HourFromTime(t), m, s, milli)).
        let dt = make_date(day(t), make_time(hour_from_time(t).into(), m, s, milli));

        let u = if LOCAL {
            // 12. Let u be TimeClip(UTC(date)).
            time_clip(utc_t(dt, context.host_hooks().as_ref()))
        } else {
            // 12. Let u be TimeClip(date).
            time_clip(dt)
        };

        // 13. Set dateObject.[[DateValue]] to u.
        date.borrow_mut().data_mut().0 = u;

        // 14. Return u.
        Ok(JsValue::from(u))
    }

    /// [`Date.prototype.setMonth ( month [ , date ] )`][local] and
    /// [`Date.prototype.setUTCMonth ( month [ , date ] )`][utc].
    ///
    /// The `setMonth()` method sets the month for a specified date according to the currently set
    /// year.
    ///
    /// [local]: https://tc39.es/ecma262/#sec-date.prototype.setmonth
    /// [utc]: https://tc39.es/ecma262/#sec-date.prototype.setutcmonth
    pub(crate) fn set_month<const LOCAL: bool>(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        let object = this.as_object();
        let date = object
            .and_then(|o| o.downcast::<Date>().ok())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?;

        // 3. Let t be dateObject.[[DateValue]].
        let mut t = date.borrow().data().0;

        // 4. Let m be ? ToNumber(month).
        let m = args.get_or_undefined(0).to_number(context)?;

        // 5. If date is present, let dt be ? ToNumber(date).
        let dt = args.get(1).map(|v| v.to_number(context)).transpose()?;

        // 6. If t is NaN, return NaN.
        if t.is_nan() {
            return Ok(JsValue::from(f64::NAN));
        }

        // 7. Set t to LocalTime(t).
        if LOCAL {
            t = local_time(t, context.host_hooks().as_ref());
        }

        // 8. If date is not present, let dt be DateFromTime(t).
        let dt = dt.unwrap_or_else(|| date_from_time(t).into());

        // 9. Let newDate be MakeDate(MakeDay(YearFromTime(t), m, dt), TimeWithinDay(t)).
        let new_date = make_date(
            make_day(year_from_time(t).into(), m, dt),
            time_within_day(t),
        );

        let u = if LOCAL {
            // 10. Let u be TimeClip(UTC(newDate)).
            time_clip(utc_t(new_date, context.host_hooks().as_ref()))
        } else {
            // 10. Let u be TimeClip(newDate).
            time_clip(new_date)
        };

        // 11. Set dateObject.[[DateValue]] to u.
        date.borrow_mut().data_mut().0 = u;

        // 12. Return u.
        Ok(JsValue::from(u))
    }

    /// [`Date.prototype.setSeconds ( sec [ , ms ] )`[local] and
    /// [`Date.prototype.setUTCSeconds ( sec [ , ms ] )`][utc].
    ///
    /// The `setSeconds()` method sets the seconds for a specified date.
    ///
    /// [local]: https://tc39.es/ecma262/#sec-date.prototype.setseconds
    /// [utc]: https://tc39.es/ecma262/#sec-date.prototype.setutcseconds
    pub(crate) fn set_seconds<const LOCAL: bool>(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        let object = this.as_object();
        let date = object
            .and_then(|o| o.downcast::<Date>().ok())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?;

        // 3. Let t be dateObject.[[DateValue]].
        let mut t = date.borrow().data().0;

        // 4. Let s be ? ToNumber(sec).
        let s = args.get_or_undefined(0).to_number(context)?;

        // 5. If ms is present, let milli be ? ToNumber(ms).
        let milli = args.get(1).map(|v| v.to_number(context)).transpose()?;

        // 6. If t is NaN, return NaN.
        if t.is_nan() {
            return Ok(JsValue::from(f64::NAN));
        }

        // 7. Set t to LocalTime(t).
        if LOCAL {
            t = local_time(t, context.host_hooks().as_ref());
        }

        // 8. If ms is not present, let milli be msFromTime(t).
        let milli = milli.unwrap_or_else(|| ms_from_time(t).into());

        // 9. Let date be MakeDate(Day(t), MakeTime(HourFromTime(t), MinFromTime(t), s, milli)).
        let dt = make_date(
            day(t),
            make_time(hour_from_time(t).into(), min_from_time(t).into(), s, milli),
        );

        let u = if LOCAL {
            // 10. Let u be TimeClip(UTC(date)).
            time_clip(utc_t(dt, context.host_hooks().as_ref()))
        } else {
            // 10. Let u be TimeClip(date).
            time_clip(dt)
        };

        // 11. Set dateObject.[[DateValue]] to u.
        date.borrow_mut().data_mut().0 = u;

        // 12. Return u.
        Ok(JsValue::from(u))
    }

    /// [`Date.prototype.setYear()`][spec].
    ///
    /// The `setYear()` method sets the year for a specified date according to local time.
    ///
    /// # Note
    ///
    /// The [`Self::set_full_year`] method is preferred for nearly all purposes, because it avoids
    /// the “year 2000 problem.”
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/setYear
    /// [spec]: https://tc39.es/ecma262/#sec-date.prototype.setyear
    pub(crate) fn set_year(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        let object = this.as_object();
        let date = object
            .and_then(|o| o.downcast::<Date>().ok())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?;

        // 3. Let t be dateObject.[[DateValue]].
        let t = date.borrow().data().0;

        // 4. Let y be ? ToNumber(year).
        let y = args.get_or_undefined(0).to_number(context)?;

        // 5. If t is NaN, set t to +0𝔽; otherwise, set t to LocalTime(t).
        let t = if t.is_nan() {
            0.0
        } else {
            local_time(t, context.host_hooks().as_ref())
        };

        // 6. Let yyyy be MakeFullYear(y).
        let yyyy = make_full_year(y);

        // 7. Let d be MakeDay(yyyy, MonthFromTime(t), DateFromTime(t)).
        let d = make_day(yyyy, month_from_time(t).into(), date_from_time(t).into());

        // 8. Let date be MakeDate(d, TimeWithinDay(t)).
        let dt = make_date(d, time_within_day(t));

        // 9. Let u be TimeClip(UTC(date)).
        let u = time_clip(utc_t(dt, context.host_hooks().as_ref()));

        // 10. Set dateObject.[[DateValue]] to u.
        date.borrow_mut().data_mut().0 = u;

        // 11. Return u.
        Ok(JsValue::from(u))
    }

    /// [`Date.prototype.setTime()`][spec].
    ///
    /// The `setTime()` method sets the Date object to the time represented by a number of milliseconds
    /// since January 1, 1970, 00:00:00 UTC.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-date.prototype.settime
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/setTime
    pub(crate) fn set_time(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        let object = this.as_object();
        let date = object
            .and_then(|o| o.downcast::<Date>().ok())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?;

        // 3. Let t be ? ToNumber(time).
        let t = args.get_or_undefined(0).to_number(context)?;

        // 4. Let v be TimeClip(t).
        let v = time_clip(t);

        // 5. Set dateObject.[[DateValue]] to v.
        date.borrow_mut().data_mut().0 = v;

        // 6. Return v.
        Ok(JsValue::from(v))
    }

    /// [`Date.prototype.toDateString()`][spec].
    ///
    /// The `toDateString()` method returns the date portion of a Date object in English.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-date.prototype.todatestring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toDateString
    pub(crate) fn to_date_string(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        // 3. Let tv be dateObject.[[DateValue]].
        let tv = this
            .as_object()
            .and_then(|obj| obj.downcast_ref::<Date>().as_deref().copied())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?
            .0;

        // 4. If tv is NaN, return "Invalid Date".
        if tv.is_nan() {
            return Ok(js_string!("Invalid Date").into());
        }

        // 5. Let t be LocalTime(tv).
        let t = local_time(tv, context.host_hooks().as_ref());

        // 6. Return DateString(t).
        Ok(JsValue::from(date_string(t)))
    }

    /// [`Date.prototype.toISOString()`][spec].
    ///
    /// The `toISOString()` method returns a string in simplified extended ISO format
    /// ([ISO 8601][iso8601]).
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [iso8601]: http://en.wikipedia.org/wiki/ISO_8601
    /// [spec]: https://tc39.es/ecma262/#sec-date.prototype.toisostring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString
    pub(crate) fn to_iso_string(
        this: &JsValue,
        _: &[JsValue],
        _: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        // 3. Let tv be dateObject.[[DateValue]].
        let tv = this
            .as_object()
            .and_then(|obj| obj.downcast_ref::<Date>().as_deref().copied())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?
            .0;

        // 4. If tv is not finite, throw a RangeError exception.
        if !tv.is_finite() {
            return Err(JsNativeError::range()
                .with_message("Invalid time value")
                .into());
        }

        // 5. If tv corresponds with a year that cannot be represented in the Date Time String Format, throw a RangeError exception.
        // 6. Return a String representation of tv in the Date Time String Format on the UTC time scale,
        //    including all format elements and the UTC offset representation "Z".
        let year = year_from_time(tv);
        let year = if year >= 10000 {
            js_string!(js_str!("+"), pad_six(year.unsigned_abs(), &mut [0; 6]))
        } else if year >= 0 {
            pad_four(year.unsigned_abs(), &mut [0; 4]).into()
        } else {
            js_string!(js_str!("-"), pad_six(year.unsigned_abs(), &mut [0; 6]))
        };
        let mut binding = [0; 2];
        let month = pad_two(month_from_time(tv) + 1, &mut binding);
        let mut binding = [0; 2];
        let day = pad_two(date_from_time(tv), &mut binding);
        let mut binding = [0; 2];
        let hour = pad_two(hour_from_time(tv), &mut binding);
        let mut binding = [0; 2];
        let minute = pad_two(min_from_time(tv), &mut binding);
        let mut binding = [0; 2];
        let second = pad_two(sec_from_time(tv), &mut binding);
        let mut binding = [0; 3];
        let millisecond = pad_three(ms_from_time(tv), &mut binding);

        Ok(JsValue::from(js_string!(
            &year,
            js_str!("-"),
            month,
            js_str!("-"),
            day,
            js_str!("T"),
            hour,
            js_str!(":"),
            minute,
            js_str!(":"),
            second,
            js_str!("."),
            millisecond,
            js_str!("Z")
        )))
    }

    /// [`Date.prototype.toJSON()`][spec].
    ///
    /// The `toJSON()` method returns a string representation of the `Date` object.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-date.prototype.tojson
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toJSON
    pub(crate) fn to_json(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let o = this.to_object(context)?;

        // 2. Let tv be ? ToPrimitive(O, number).
        let tv = this.to_primitive(context, PreferredType::Number)?;

        // 3. If Type(tv) is Number and tv is not finite, return null.
        if tv.as_number().is_some_and(|x| !f64::is_finite(x)) {
            return Ok(JsValue::null());
        }

        // 4. Return ? Invoke(O, "toISOString").
        let func = o.get(js_string!("toISOString"), context)?;
        func.call(this, &[], context)
    }

    /// Shared implementation of `Date.prototype.toLocaleString`,
    /// `Date.prototype.toLocaleDateString`, and `Date.prototype.toLocaleTimeString`
    /// methods with the corresponding formatting params
    #[cfg(feature = "intl")]
    #[inline]
    fn to_locale_string_with(
        this: &JsValue,
        args: &[JsValue],
        required: FormatType,
        defaults: FormatDefaults,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        // 3. Let x be dateObject.[[DateValue]].
        let x = this
            .as_object()
            .and_then(|obj| obj.downcast_ref::<Date>().as_deref().copied())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?
            .0;

        // 4. If x is NaN, return "Invalid Date".
        if x.is_nan() {
            return Ok(JsValue::new(js_string!("Invalid Date")));
        }

        // 5. Let dateFormat be ? CreateDateTimeFormat(%Intl.DateTimeFormat%, locales, options, required, defaults).
        // 6. Return ! FormatDateTime(dateFormat, x).
        let locales = args.get_or_undefined(0);
        let options = args.get_or_undefined(1);
        let dtf = create_date_time_format(locales, options, required, defaults, context)?;
        format_timestamp_with_dtf(&dtf, x, context)
    }

    /// [`Date.prototype.toLocaleDateString()`][spec].
    ///
    /// The `toLocaleDateString()` method returns the date portion of the given Date instance according
    /// to language-specific conventions.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sup-date.prototype.tolocaledatestring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toLocaleDateString
    pub(crate) fn to_locale_date_string(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        #[cfg(feature = "intl")]
        {
            Self::to_locale_string_with(this, args, FormatType::Date, FormatDefaults::Date, context)
        }
        #[cfg(not(feature = "intl"))]
        {
            Self::to_string(this, args, context)
        }
    }

    /// [`Date.prototype.toLocaleString()`][spec].
    ///
    /// The `toLocaleString()` method returns a string representing the specified Date object.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sup-date.prototype.tolocalestring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toLocaleString
    pub(crate) fn to_locale_string(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        #[cfg(feature = "intl")]
        {
            Self::to_locale_string_with(this, args, FormatType::Any, FormatDefaults::All, context)
        }
        #[cfg(not(feature = "intl"))]
        {
            Self::to_string(this, args, context)
        }
    }

    /// [`Date.prototype.toLocaleTimeString()`][spec].
    ///
    /// The `toLocaleTimeString()` method returns the time portion of a Date object in human readable
    /// form in American English.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sup-date.prototype.tolocaletimestring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toLocaleTimeString
    pub(crate) fn to_locale_time_string(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        #[cfg(feature = "intl")]
        {
            Self::to_locale_string_with(this, args, FormatType::Time, FormatDefaults::Time, context)
        }
        #[cfg(not(feature = "intl"))]
        {
            Self::to_string(this, args, context)
        }
    }

    /// [`Date.prototype.toString()`][spec].
    ///
    /// The `toString()` method returns a string representing the specified Date object.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-date.prototype.tostring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toString
    pub(crate) fn to_string(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        // 3. Let tv be dateObject.[[DateValue]].
        let tv = this
            .as_object()
            .and_then(|obj| obj.downcast_ref::<Date>().as_deref().copied())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?
            .0;

        // 4. Return ToDateString(tv).
        Ok(JsValue::from(to_date_string_t(
            tv,
            context.host_hooks().as_ref(),
        )))
    }

    /// [`Date.prototype.toTimeString()`][spec].
    ///
    /// The `toTimeString()` method returns the time portion of a Date object in human readable form
    /// in American English.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-date.prototype.totimestring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toTimeString
    pub(crate) fn to_time_string(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        // 3. Let tv be dateObject.[[DateValue]].
        let tv = this
            .as_object()
            .and_then(|obj| obj.downcast_ref::<Date>().as_deref().copied())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?
            .0;

        // 4. If tv is NaN, return "Invalid Date".
        if tv.is_nan() {
            return Ok(js_string!("Invalid Date").into());
        }

        // 5. Let t be LocalTime(tv).
        let t = local_time(tv, context.host_hooks().as_ref());

        // 6. Return the string-concatenation of TimeString(t) and TimeZoneString(tv).
        Ok(JsValue::from(js_string!(
            &time_string(t),
            &time_zone_string(t, context.host_hooks().as_ref())
        )))
    }

    /// [`Date.prototype.toUTCString()`][spec].
    ///
    /// The `toUTCString()` method returns a string representing the specified Date object.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-date.prototype.toutcstring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toUTCString
    pub(crate) fn to_utc_string(
        this: &JsValue,
        _args: &[JsValue],
        _context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        // 3. Let tv be dateObject.[[DateValue]].
        let tv = this
            .as_object()
            .and_then(|obj| obj.downcast_ref::<Date>().as_deref().copied())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?
            .0;

        // 4. If tv is NaN, return "Invalid Date".
        if tv.is_nan() {
            return Ok(js_string!("Invalid Date").into());
        }

        // 5. Let weekday be the Name of the entry in Table 63 with the Number WeekDay(tv).
        let weekday = match week_day(tv) {
            0 => js_str!("Sun"),
            1 => js_str!("Mon"),
            2 => js_str!("Tue"),
            3 => js_str!("Wed"),
            4 => js_str!("Thu"),
            5 => js_str!("Fri"),
            6 => js_str!("Sat"),
            _ => unreachable!(),
        };

        // 6. Let month be the Name of the entry in Table 64 with the Number MonthFromTime(tv).
        let month = match month_from_time(tv) {
            0 => js_str!("Jan"),
            1 => js_str!("Feb"),
            2 => js_str!("Mar"),
            3 => js_str!("Apr"),
            4 => js_str!("May"),
            5 => js_str!("Jun"),
            6 => js_str!("Jul"),
            7 => js_str!("Aug"),
            8 => js_str!("Sep"),
            9 => js_str!("Oct"),
            10 => js_str!("Nov"),
            11 => js_str!("Dec"),
            _ => unreachable!(),
        };

        // 7. Let day be ToZeroPaddedDecimalString(ℝ(DateFromTime(tv)), 2).
        let mut binding = [0; 2];
        let day = pad_two(date_from_time(tv), &mut binding);

        // 8. Let yv be YearFromTime(tv).
        let yv = year_from_time(tv);

        // 9. If yv is +0𝔽 or yv > +0𝔽, let yearSign be the empty String; otherwise, let yearSign be "-".
        let year_sign = if yv >= 0 { js_str!("") } else { js_str!("-") };

        // 10. Let paddedYear be ToZeroPaddedDecimalString(abs(ℝ(yv)), 4).
        let yv = yv.unsigned_abs();
        let padded_year: JsString = if yv >= 100_000 {
            pad_six(yv, &mut [0; 6]).into()
        } else if yv >= 10000 {
            pad_five(yv, &mut [0; 5]).into()
        } else {
            pad_four(yv, &mut [0; 4]).into()
        };

        // 11. Return the string-concatenation of
        // weekday,
        // ",",
        // the code unit 0x0020 (SPACE),
        // day,
        // the code unit 0x0020 (SPACE),
        // month,
        // the code unit 0x0020 (SPACE),
        // yearSign,
        // paddedYear,
        // the code unit 0x0020 (SPACE),
        // and TimeString(tv).
        Ok(JsValue::from(js_string!(
            weekday,
            js_str!(","),
            js_str!(" "),
            day,
            js_str!(" "),
            month,
            js_str!(" "),
            year_sign,
            &padded_year,
            js_str!(" "),
            &time_string(tv)
        )))
    }

    /// [`Date.prototype.valueOf()`][spec].
    ///
    /// The `valueOf()` method returns the primitive value of a `Date` object.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-date.prototype.valueof
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/valueOf
    pub(crate) fn value_of(
        this: &JsValue,
        _args: &[JsValue],
        _context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        // 3. Return dateObject.[[DateValue]].
        Ok(this
            .as_object()
            .and_then(|obj| obj.downcast_ref::<Date>().as_deref().copied())
            .ok_or_else(|| JsNativeError::typ().with_message("'this' is not a Date"))?
            .0
            .into())
    }

    /// [`Date.prototype [ @@toPrimitive ] ( hint )`][spec].
    ///
    /// The <code>\[@@toPrimitive\]()</code> method converts a Date object to a primitive value.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-date.prototype-@@toprimitive
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/@@toPrimitive
    pub(crate) fn to_primitive(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. If Type(O) is not Object, throw a TypeError exception.
        let o = this.as_object().ok_or_else(|| {
            JsNativeError::typ().with_message("Date.prototype[@@toPrimitive] called on non object")
        })?;

        let hint = args.get_or_undefined(0);

        let try_first = match hint.as_string() {
            // 3. If hint is "string" or "default", then
            // a. Let tryFirst be string.
            Some(string) if string == "string" || string == "default" => PreferredType::String,
            // 4. Else if hint is "number", then
            // a. Let tryFirst be number.
            Some(number) if number == "number" => PreferredType::Number,
            // 5. Else, throw a TypeError exception.
            _ => {
                return Err(JsNativeError::typ()
                    .with_message("Date.prototype[@@toPrimitive] called with invalid hint")
                    .into());
            }
        };

        // 6. Return ? OrdinaryToPrimitive(O, tryFirst).
        o.ordinary_to_primitive(context, try_first)
    }

    /// 14.9.1 `Date.prototype.toTemporalInstant ()`
    ///
    /// Returns a JavaScript Date as a `Temporal.Instant`.
    ///
    /// More information:
    ///  - [Temporal Proposal][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-date.prototype.totemporalinstant
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toTemporalInstant/
    #[cfg(feature = "temporal")]
    pub(crate) fn to_temporal_instant(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        use crate::{builtins::temporal::create_temporal_instant, js_error};
        use num_traits::FromPrimitive;
        use temporal_rs::Instant;

        const NS_PER_MILLISECOND: i128 = 1_000_000;
        // 1. Let dateObject be the this value.
        // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
        // 3. Let t be dateObject.[[DateValue]].
        let t = this
            .as_object()
            .and_then(|obj| obj.downcast_ref::<Date>().as_deref().copied())
            .ok_or_else(|| js_error!(TypeError: "'this' is not a Date"))?
            .0;

        // 4. Let ns be ? NumberToBigInt(t) × ℤ(10**6).
        let ns = i128::from_f64(t)
            .ok_or(js_error!(RangeError: "[[DateValue]] is not an integral number."))?
            * NS_PER_MILLISECOND;
        // 5. Return ! CreateTemporalInstant(ns).
        create_temporal_instant(Instant::try_new(ns)?, None, context)
    }
}
