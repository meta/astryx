// Boa's implementation of the `Temporal.Duration` built-in object.

use super::{
    DateTimeValues, get_relative_to_option,
    options::{TemporalUnitGroup, get_digits_option, get_temporal_unit},
};
use crate::value::JsVariant;
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
};
use boa_gc::{Finalize, Trace};
use temporal_rs::{
    Duration as InnerDuration,
    options::{RoundingIncrement, RoundingMode, RoundingOptions, ToStringRoundingOptions, Unit},
    partial::PartialDuration,
};

#[cfg(test)]
mod tests;

/// The `Temporal.Duration` built-in implementation
///
/// More information:
///
/// - [ECMAScript Temporal proposal][spec]
/// - [MDN reference][mdn]
/// - [`temporal_rs` documentation][temporal_rs-docs]
///
/// [spec]: https://tc39.es/proposal-temporal/#sec-temporal-duration-objects
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration
/// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Duration.html
#[derive(Debug, Clone, Trace, Finalize, JsData)]
#[boa_gc(unsafe_empty_trace)] // Safety: Does not contain any traceable fields.
pub struct Duration {
    pub(crate) inner: Box<InnerDuration>,
}

impl Duration {
    pub(crate) fn new(inner: InnerDuration) -> Self {
        Self {
            inner: Box::new(inner),
        }
    }
}

impl BuiltInObject for Duration {
    const NAME: JsString = StaticJsStrings::DURATION_NAME;
}

impl IntrinsicObject for Duration {
    fn init(realm: &Realm) {
        let get_years = BuiltInBuilder::callable(realm, Self::get_years)
            .name(js_string!("get Years"))
            .build();

        let get_months = BuiltInBuilder::callable(realm, Self::get_months)
            .name(js_string!("get Months"))
            .build();

        let get_weeks = BuiltInBuilder::callable(realm, Self::get_weeks)
            .name(js_string!("get Weeks"))
            .build();

        let get_days = BuiltInBuilder::callable(realm, Self::get_days)
            .name(js_string!("get Days"))
            .build();

        let get_hours = BuiltInBuilder::callable(realm, Self::get_hours)
            .name(js_string!("get Hours"))
            .build();

        let get_minutes = BuiltInBuilder::callable(realm, Self::get_minutes)
            .name(js_string!("get Minutes"))
            .build();

        let get_seconds = BuiltInBuilder::callable(realm, Self::get_seconds)
            .name(js_string!("get Seconds"))
            .build();

        let get_milliseconds = BuiltInBuilder::callable(realm, Self::get_milliseconds)
            .name(js_string!("get Milliseconds"))
            .build();

        let get_microseconds = BuiltInBuilder::callable(realm, Self::get_microseconds)
            .name(js_string!("get Microseconds"))
            .build();

        let get_nanoseconds = BuiltInBuilder::callable(realm, Self::get_nanoseconds)
            .name(js_string!("get Nanoseconds"))
            .build();

        let get_sign = BuiltInBuilder::callable(realm, Self::get_sign)
            .name(js_string!("get Sign"))
            .build();

        let is_blank = BuiltInBuilder::callable(realm, Self::get_blank)
            .name(js_string!("get blank"))
            .build();

        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .property(
                JsSymbol::to_string_tag(),
                StaticJsStrings::DURATION_TAG,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("years"),
                Some(get_years),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("months"),
                Some(get_months),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("weeks"),
                Some(get_weeks),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("days"),
                Some(get_days),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("hours"),
                Some(get_hours),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("minutes"),
                Some(get_minutes),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("seconds"),
                Some(get_seconds),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("milliseconds"),
                Some(get_milliseconds),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("microseconds"),
                Some(get_microseconds),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("nanoseconds"),
                Some(get_nanoseconds),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("sign"),
                Some(get_sign),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("blank"),
                Some(is_blank),
                None,
                Attribute::CONFIGURABLE,
            )
            .static_method(Self::from, js_string!("from"), 1)
            .static_method(Self::compare, js_string!("compare"), 2)
            .method(Self::with, js_string!("with"), 1)
            .method(Self::negated, js_string!("negated"), 0)
            .method(Self::abs, js_string!("abs"), 0)
            .method(Self::add, js_string!("add"), 1)
            .method(Self::subtract, js_string!("subtract"), 1)
            .method(Self::round, js_string!("round"), 1)
            .method(Self::total, js_string!("total"), 1)
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

impl BuiltInConstructor for Duration {
    const CONSTRUCTOR_ARGUMENTS: usize = 0;
    const PROTOTYPE_STORAGE_SLOTS: usize = 36;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 2;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::duration;

    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is undefined, then
        if new_target.is_undefined() {
            // a. Throw a TypeError exception.
            return Err(JsNativeError::typ()
                .with_message("NewTarget cannot be undefined for Temporal.Duration constructor.")
                .into());
        }

        // 2. If years is undefined, let y be 0; else let y be ? ToIntegerIfIntegral(years).
        let years = args.get_or_undefined(0).map_or(Ok(0), |v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_integer_if_integral::<i64>()
                .map_err(JsError::from)
        })?;

        // 3. If months is undefined, let mo be 0; else let mo be ? ToIntegerIfIntegral(months).
        let months = args.get_or_undefined(1).map_or(Ok(0), |v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_integer_if_integral::<i64>()
                .map_err(JsError::from)
        })?;

        // 4. If weeks is undefined, let w be 0; else let w be ? ToIntegerIfIntegral(weeks).
        let weeks = args.get_or_undefined(2).map_or(Ok(0), |v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_integer_if_integral::<i64>()
                .map_err(JsError::from)
        })?;

        // 5. If days is undefined, let d be 0; else let d be ? ToIntegerIfIntegral(days).
        let days = args.get_or_undefined(3).map_or(Ok(0), |v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_integer_if_integral::<i64>()
                .map_err(JsError::from)
        })?;

        // 6. If hours is undefined, let h be 0; else let h be ? ToIntegerIfIntegral(hours).
        let hours = args.get_or_undefined(4).map_or(Ok(0), |v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_integer_if_integral::<i64>()
                .map_err(JsError::from)
        })?;

        // 7. If minutes is undefined, let m be 0; else let m be ? ToIntegerIfIntegral(minutes).
        let minutes = args.get_or_undefined(5).map_or(Ok(0), |v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_integer_if_integral::<i64>()
                .map_err(JsError::from)
        })?;

        // 8. If seconds is undefined, let s be 0; else let s be ? ToIntegerIfIntegral(seconds).
        let seconds = args.get_or_undefined(6).map_or(Ok(0), |v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_integer_if_integral::<i64>()
                .map_err(JsError::from)
        })?;

        // 9. If milliseconds is undefined, let ms be 0; else let ms be ? ToIntegerIfIntegral(milliseconds).
        let milliseconds = args.get_or_undefined(7).map_or(Ok(0), |v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_integer_if_integral::<i64>()
                .map_err(JsError::from)
        })?;

        // 10. If microseconds is undefined, let mis be 0; else let mis be ? ToIntegerIfIntegral(microseconds).
        let microseconds = args.get_or_undefined(8).map_or(Ok(0), |v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_integer_if_integral::<i128>()
                .map_err(JsError::from)
        })?;

        // 11. If nanoseconds is undefined, let ns be 0; else let ns be ? ToIntegerIfIntegral(nanoseconds).
        let nanoseconds = args.get_or_undefined(9).map_or(Ok(0), |v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_integer_if_integral::<i128>()
                .map_err(JsError::from)
        })?;

        let record = InnerDuration::new(
            years,
            months,
            weeks,
            days,
            hours,
            minutes,
            seconds,
            milliseconds,
            microseconds,
            nanoseconds,
        )?;

        // 12. Return ? CreateTemporalDuration(y, mo, w, d, h, m, s, ms, mis, ns, NewTarget).
        create_temporal_duration(record, Some(new_target), context).map(Into::into)
    }
}

// ==== Duration accessor property implementations ====

impl Duration {
    // Internal utility function for getting `Duration` field values.
    fn get_internal_field(this: &JsValue, field: &DateTimeValues) -> JsResult<JsValue> {
        let object = this.as_object();
        let duration = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a Duration object.")
            })?;

        let inner = &duration.inner;

        match field {
            DateTimeValues::Year => Ok(JsValue::new(inner.years())),
            DateTimeValues::Month => Ok(JsValue::new(inner.months())),
            DateTimeValues::Week => Ok(JsValue::new(inner.weeks())),
            DateTimeValues::Day => Ok(JsValue::new(inner.days())),
            DateTimeValues::Hour => Ok(JsValue::new(inner.hours())),
            DateTimeValues::Minute => Ok(JsValue::new(inner.minutes())),
            DateTimeValues::Second => Ok(JsValue::new(inner.seconds())),
            DateTimeValues::Millisecond => Ok(JsValue::new(inner.milliseconds())),
            DateTimeValues::Microsecond => Ok(JsValue::new(inner.microseconds() as f64)),
            DateTimeValues::Nanosecond => Ok(JsValue::new(inner.nanoseconds() as f64)),
            DateTimeValues::MonthCode => unreachable!(
                "Any other DateTimeValue fields on Duration would be an implementation error."
            ),
        }
    }

    /// 7.3.3 get `Temporal.Duration.prototype.years`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.duration.prototype.years
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/years
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Duration.html#method.years
    fn get_years(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Self::get_internal_field(this, &DateTimeValues::Year)
    }

    // 7.3.4 get `Temporal.Duration.prototype.months`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.duration.prototype.months
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/months
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Duration.html#method.months
    fn get_months(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Self::get_internal_field(this, &DateTimeValues::Month)
    }

    /// 7.3.5 get `Temporal.Duration.prototype.weeks`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.duration.prototype.weeks
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/weeks
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Duration.html#method.weeks
    fn get_weeks(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Self::get_internal_field(this, &DateTimeValues::Week)
    }

    /// 7.3.6 get `Temporal.Duration.prototype.days`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.duration.prototype.days
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/days
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Duration.html#method.days
    fn get_days(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Self::get_internal_field(this, &DateTimeValues::Day)
    }

    /// 7.3.7 get `Temporal.Duration.prototype.hours`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.duration.prototype.hours
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/hours
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Duration.html#method.hours
    fn get_hours(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Self::get_internal_field(this, &DateTimeValues::Hour)
    }

    /// 7.3.8 get `Temporal.Duration.prototype.minutes`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.duration.prototype.minutes
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/minutes
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Duration.html#method.minutes
    fn get_minutes(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Self::get_internal_field(this, &DateTimeValues::Minute)
    }

    /// 7.3.9 get `Temporal.Duration.prototype.seconds`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.duration.prototype.seconds
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/seconds
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Duration.html#method.seconds
    fn get_seconds(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Self::get_internal_field(this, &DateTimeValues::Second)
    }

    /// 7.3.10 get `Temporal.Duration.prototype.milliseconds`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.duration.prototype.milliseconds
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/milliseconds
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Duration.html#method.milliseconds
    fn get_milliseconds(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Self::get_internal_field(this, &DateTimeValues::Millisecond)
    }

    /// 7.3.11 get `Temporal.Duration.prototype.microseconds`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.duration.prototype.microseconds
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/microseconds
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Duration.html#method.microseconds
    fn get_microseconds(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Self::get_internal_field(this, &DateTimeValues::Microsecond)
    }

    /// 7.3.12 get `Temporal.Duration.prototype.nanoseconds`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.duration.prototype.nanoseconds
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/nanoseconds
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Duration.html#method.nanoseconds
    fn get_nanoseconds(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Self::get_internal_field(this, &DateTimeValues::Nanosecond)
    }

    /// 7.3.13 get `Temporal.Duration.prototype.sign`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.duration.prototype.sign
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/sign
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Duration.html#method.sign
    fn get_sign(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let duration be the this value.
        // 2. Perform ? RequireInternalSlot(duration, [[InitializedTemporalDuration]]).
        let object = this.as_object();
        let duration = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a Duration object.")
            })?;

        // 3. Return 𝔽(! DurationSign(duration.[[Years]], duration.[[Months]], duration.[[Weeks]],
        // duration.[[Days]], duration.[[Hours]], duration.[[Minutes]], duration.[[Seconds]],
        // duration.[[Milliseconds]], duration.[[Microseconds]], duration.[[Nanoseconds]])).
        Ok((duration.inner.sign() as i8).into())
    }

    /// 7.3.14 get `Temporal.Duration.prototype.blank`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.duration.prototype.blank
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/blank
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Duration.html#method.blank
    fn get_blank(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let duration be the this value.
        // 2. Perform ? RequireInternalSlot(duration, [[InitializedTemporalDuration]]).
        let object = this.as_object();
        let duration = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a Duration object.")
            })?;

        // 3. Let sign be ! DurationSign(duration.[[Years]], duration.[[Months]], duration.[[Weeks]],
        // duration.[[Days]], duration.[[Hours]], duration.[[Minutes]], duration.[[Seconds]],
        // duration.[[Milliseconds]], duration.[[Microseconds]], duration.[[Nanoseconds]]).
        // 4. If sign = 0, return true.
        // 5. Return false.
        Ok(duration.inner.is_zero().into())
    }
}

// ==== Duration static methods implementation ====

impl Duration {
    /// 7.2.2 `Temporal.Duration.from ( item )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.duration.from
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/from
    fn from(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let item = args.get_or_undefined(0);
        // 1. If item is an Object and item has an [[InitializedTemporalDuration]] internal slot, then
        let object = item.as_object();
        if let Some(duration) = object.as_ref().and_then(JsObject::downcast_ref::<Self>) {
            // a. Return ! CreateTemporalDuration(item.[[Years]], item.[[Months]], item.[[Weeks]],
            // item.[[Days]], item.[[Hours]], item.[[Minutes]], item.[[Seconds]], item.[[Milliseconds]],
            // item.[[Microseconds]], item.[[Nanoseconds]]).
            return create_temporal_duration(*duration.inner, None, context).map(Into::into);
        }

        // 2. Return ? ToTemporalDuration(item).
        create_temporal_duration(to_temporal_duration_record(item, context)?, None, context)
            .map(Into::into)
    }

    /// 7.2.3 `Temporal.Duration.compare ( one, two [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.duration.compare
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/compare
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Duration.html#method.compare
    fn compare(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Set one to ? ToTemporalDuration(one).
        let one = to_temporal_duration(args.get_or_undefined(0), context)?;
        // 2. Set two to ? ToTemporalDuration(two).
        let two = to_temporal_duration(args.get_or_undefined(1), context)?;
        // 3. Let resolvedOptions be ? GetOptionsObject(options).
        let options = get_options_object(args.get_or_undefined(2))?;
        // 4. Let relativeToRecord be ? GetTemporalRelativeToOption(resolvedOptions).
        let relative_to = get_relative_to_option(&options, context)?;

        Ok(
            (one.compare_with_provider(&two, relative_to, context.timezone_provider())? as i8)
                .into(),
        )
    }
}

// ==== Duration methods implementation ====

impl Duration {
    /// 7.3.15 `Temporal.Duration.prototype.with ( temporalDurationLike )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.duration.prototype.with
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/with
    pub(crate) fn with(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let duration be the this value.
        // 2. Perform ? RequireInternalSlot(duration, [[InitializedTemporalDuration]]).
        let object = this.as_object();
        let duration = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a Duration object.")
            })?;

        // 3. Let temporalDurationLike be ? ToTemporalPartialDurationRecord(temporalDurationLike).
        let temporal_duration_like =
            to_temporal_partial_duration(args.get_or_undefined(0), context)?;

        // 4. If temporalDurationLike.[[Years]] is not undefined, then
        // a. Let years be temporalDurationLike.[[Years]].
        // 5. Else,
        // a. Let years be duration.[[Years]].
        let years = temporal_duration_like
            .years
            .unwrap_or(duration.inner.years());

        // 6. If temporalDurationLike.[[Months]] is not undefined, then
        // a. Let months be temporalDurationLike.[[Months]].
        // 7. Else,
        // a. Let months be duration.[[Months]].
        let months = temporal_duration_like
            .months
            .unwrap_or(duration.inner.months());

        // 8. If temporalDurationLike.[[Weeks]] is not undefined, then
        // a. Let weeks be temporalDurationLike.[[Weeks]].
        // 9. Else,
        // a. Let weeks be duration.[[Weeks]].
        let weeks = temporal_duration_like
            .weeks
            .unwrap_or(duration.inner.weeks());

        // 10. If temporalDurationLike.[[Days]] is not undefined, then
        // a. Let days be temporalDurationLike.[[Days]].
        // 11. Else,
        // a. Let days be duration.[[Days]].
        let days = temporal_duration_like.days.unwrap_or(duration.inner.days());

        // 12. If temporalDurationLike.[[Hours]] is not undefined, then
        // a. Let hours be temporalDurationLike.[[Hours]].
        // 13. Else,
        // a. Let hours be duration.[[Hours]].
        let hours = temporal_duration_like
            .hours
            .unwrap_or(duration.inner.hours());

        // 14. If temporalDurationLike.[[Minutes]] is not undefined, then
        // a. Let minutes be temporalDurationLike.[[Minutes]].
        // 15. Else,
        // a. Let minutes be duration.[[Minutes]].
        let minutes = temporal_duration_like
            .minutes
            .unwrap_or(duration.inner.minutes());

        // 16. If temporalDurationLike.[[Seconds]] is not undefined, then
        // a. Let seconds be temporalDurationLike.[[Seconds]].
        // 17. Else,
        // a. Let seconds be duration.[[Seconds]].
        let seconds = temporal_duration_like
            .seconds
            .unwrap_or(duration.inner.seconds());

        // 18. If temporalDurationLike.[[Milliseconds]] is not undefined, then
        // a. Let milliseconds be temporalDurationLike.[[Milliseconds]].
        // 19. Else,
        // a. Let milliseconds be duration.[[Milliseconds]].
        let milliseconds = temporal_duration_like
            .milliseconds
            .unwrap_or(duration.inner.milliseconds());

        // 20. If temporalDurationLike.[[Microseconds]] is not undefined, then
        // a. Let microseconds be temporalDurationLike.[[Microseconds]].
        // 21. Else,
        // a. Let microseconds be duration.[[Microseconds]].
        let microseconds = temporal_duration_like
            .microseconds
            .unwrap_or(duration.inner.microseconds());

        // 22. If temporalDurationLike.[[Nanoseconds]] is not undefined, then
        // a. Let nanoseconds be temporalDurationLike.[[Nanoseconds]].
        // 23. Else,
        // a. Let nanoseconds be duration.[[Nanoseconds]].
        let nanoseconds = temporal_duration_like
            .nanoseconds
            .unwrap_or(duration.inner.nanoseconds());

        // 24. Return ? CreateTemporalDuration(years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds).
        let new_duration = InnerDuration::new(
            years,
            months,
            weeks,
            days,
            hours,
            minutes,
            seconds,
            milliseconds,
            microseconds,
            nanoseconds,
        )?;
        create_temporal_duration(new_duration, None, context).map(Into::into)
    }

    /// 7.3.16 `Temporal.Duration.prototype.negated ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.duration.prototype.negated
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/negated
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Duration.html#method.negated
    pub(crate) fn negated(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let duration be the this value.
        // 2. Perform ? RequireInternalSlot(duration, [[InitializedTemporalDuration]]).
        // 3. Return ! CreateNegatedTemporalDuration(duration).
        let object = this.as_object();
        let duration = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a Duration object.")
            })?;

        create_temporal_duration(duration.inner.negated(), None, context).map(Into::into)
    }

    /// 7.3.17 `Temporal.Duration.prototype.abs ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.duration.prototype.abs
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/abs
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Duration.html#method.abs
    pub(crate) fn abs(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let duration be the this value.
        // 2. Perform ? RequireInternalSlot(duration, [[InitializedTemporalDuration]]).
        // 3. Return ! CreateTemporalDuration(abs(duration.[[Years]]), abs(duration.[[Months]]),
        //    abs(duration.[[Weeks]]), abs(duration.[[Days]]), abs(duration.[[Hours]]), abs(duration.[[Minutes]]),
        //    abs(duration.[[Seconds]]), abs(duration.[[Milliseconds]]), abs(duration.[[Microseconds]]), abs(duration.[[Nanoseconds]])).
        let object = this.as_object();
        let duration = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a Duration object.")
            })?;

        create_temporal_duration(duration.inner.abs(), None, context).map(Into::into)
    }

    /// 7.3.18 `Temporal.Duration.prototype.add ( other [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.duration.prototype.add
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/add
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Duration.html#method.add
    pub(crate) fn add(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1.Let duration be the this value.
        // 2. Perform ? RequireInternalSlot(duration, [[InitializedTemporalDuration]]).
        let object = this.as_object();
        let duration = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a Duration object.")
            })?;

        // 3. Return ? AddDurations(add, duration, other).
        let other = to_temporal_duration_record(args.get_or_undefined(0), context)?;

        create_temporal_duration(duration.inner.add(&other)?, None, context).map(Into::into)
    }

    /// 7.3.19 `Temporal.Duration.prototype.subtract ( other [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.duration.prototype.subtract
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/subtract
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Duration.html#method.subtract
    pub(crate) fn subtract(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1.Let duration be the this value.
        // 2. Perform ? RequireInternalSlot(duration, [[InitializedTemporalDuration]]).
        let object = this.as_object();
        let duration = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a Duration object.")
            })?;

        let other = to_temporal_duration_record(args.get_or_undefined(0), context)?;

        // 3. Return ? AddDurations(add, duration, other).
        create_temporal_duration(duration.inner.subtract(&other)?, None, context).map(Into::into)
    }

    /// 7.3.20 `Temporal.Duration.prototype.round ( roundTo )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.duration.prototype.round
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/round
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Duration.html#method.round
    pub(crate) fn round(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let duration be the this value.
        // 2. Perform ? RequireInternalSlot(duration, [[InitializedTemporalDuration]]).
        let object = this.as_object();
        let duration = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a Duration object.")
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

        // NOTE: 6 & 7 unused in favor of `is_none()`.
        // 6. Let smallestUnitPresent be true.
        // 7. Let largestUnitPresent be true.
        let mut options = RoundingOptions::default();

        // 8. NOTE: The following steps read options and perform independent validation in alphabetical order (ToRelativeTemporalObject reads "relativeTo", ToTemporalRoundingIncrement reads "roundingIncrement" and ToTemporalRoundingMode reads "roundingMode").
        // 9. Let largestUnit be ? GetTemporalUnit(roundTo, "largestUnit", datetime, undefined, « "auto" »).
        options.largest_unit = get_temporal_unit(
            &round_to,
            js_string!("largestUnit"),
            TemporalUnitGroup::DateTime,
            Some([Unit::Auto].into()),
            context,
        )?;

        // 10. Let relativeToRecord be ? ToRelativeTemporalObject(roundTo).
        // 11. Let zonedRelativeTo be relativeToRecord.[[ZonedRelativeTo]].
        // 12. Let plainRelativeTo be relativeToRecord.[[PlainRelativeTo]].
        let relative_to = get_relative_to_option(&round_to, context)?;

        // 13. Let roundingIncrement be ? ToTemporalRoundingIncrement(roundTo).
        options.increment =
            get_option::<RoundingIncrement>(&round_to, js_string!("roundingIncrement"), context)?;

        // 14. Let roundingMode be ? ToTemporalRoundingMode(roundTo, "halfExpand").
        options.rounding_mode =
            get_option::<RoundingMode>(&round_to, js_string!("roundingMode"), context)?;

        // 15. Let smallestUnit be ? GetTemporalUnit(roundTo, "smallestUnit", datetime, undefined).
        options.smallest_unit = get_temporal_unit(
            &round_to,
            js_string!("smallestUnit"),
            TemporalUnitGroup::DateTime,
            None,
            context,
        )?;

        // NOTE: execute step 21 earlier before initial values are shadowed.
        // 21. If smallestUnitPresent is false and largestUnitPresent is false, then

        let rounded_duration = duration.inner.round_with_provider(
            options,
            relative_to,
            context.timezone_provider(),
        )?;
        create_temporal_duration(rounded_duration, None, context).map(Into::into)
    }

    /// 7.3.21 `Temporal.Duration.prototype.total ( totalOf )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.duration.prototype.total
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/total
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Duration.html#method.total
    pub(crate) fn total(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let duration be the this value.
        // 2. Perform ? RequireInternalSlot(duration, [[InitializedTemporalDuration]]).
        let object = this.as_object();
        let duration = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a Duration object.")
            })?;

        let total_of = args.get_or_undefined(0);

        let total_of = match total_of.variant() {
            // 3. If totalOf is undefined, throw a TypeError exception.
            JsVariant::Undefined => {
                return Err(JsNativeError::typ()
                    .with_message("totalOf cannot be undefined.")
                    .into());
            }
            // 4. If Type(totalOf) is String, then
            JsVariant::String(param_string) => {
                // a. Let paramString be totalOf.
                // b. Set totalOf to OrdinaryObjectCreate(null).
                let total_of = JsObject::with_null_proto();
                // c. Perform ! CreateDataPropertyOrThrow(totalOf, "unit", paramString).
                total_of.create_data_property_or_throw(
                    js_string!("unit"),
                    param_string.clone(),
                    context,
                )?;
                total_of
            }
            // 5. Else,
            _ => {
                // a. Set totalOf to ? GetOptionsObject(totalOf).
                get_options_object(total_of)?
            }
        };

        // 6. NOTE: The following steps read options and perform independent validation in alphabetical order (ToRelativeTemporalObject reads "relativeTo").
        // 7. Let relativeToRecord be ? ToRelativeTemporalObject(totalOf).
        // 8. Let zonedRelativeTo be relativeToRecord.[[ZonedRelativeTo]].
        // 9. Let plainRelativeTo be relativeToRecord.[[PlainRelativeTo]].
        let relative_to = get_relative_to_option(&total_of, context)?;

        // 10. Let unit be ? GetTemporalUnit(totalOf, "unit", datetime, required).
        let unit = get_temporal_unit(
            &total_of,
            js_string!("unit"),
            TemporalUnitGroup::DateTime,
            None,
            context,
        )?
        .ok_or_else(|| JsNativeError::range().with_message("unit cannot be undefined."))?;

        Ok(duration
            .inner
            .total_with_provider(unit, relative_to, context.timezone_provider())?
            .as_inner()
            .into())
    }

    /// 7.3.22 `Temporal.Duration.prototype.toString ( [ options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.duration.prototype.tostring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/toString
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Duration.html#method.as_temporal_string
    pub(crate) fn to_string(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let object = this.as_object();
        let duration = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a Duration object.")
            })?;

        let options = get_options_object(args.get_or_undefined(0))?;
        let precision = get_digits_option(&options, context)?;
        let rounding_mode =
            get_option::<RoundingMode>(&options, js_string!("roundingMode"), context)?;
        let smallest_unit = get_option::<Unit>(&options, js_string!("smallestUnit"), context)?;

        let result = duration.inner.as_temporal_string(ToStringRoundingOptions {
            precision,
            smallest_unit,
            rounding_mode,
        })?;

        Ok(JsString::from(result).into())
    }

    /// 7.3.23 `Temporal.Duration.prototype.toJSON ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.duration.prototype.tojson
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/toJSON
    pub(crate) fn to_json(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let duration = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a Duration object.")
            })?;

        let result = duration
            .inner
            .as_temporal_string(ToStringRoundingOptions::default())?;

        Ok(JsString::from(result).into())
    }

    /// 7.3.24 `Temporal.Duration.prototype.toLocaleString ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.duration.prototype.tolocalestring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/toLocaleString
    pub(crate) fn to_locale_string(
        this: &JsValue,
        _: &[JsValue],
        _: &mut Context,
    ) -> JsResult<JsValue> {
        // TODO: Update for ECMA-402 compliance
        let object = this.as_object();
        let duration = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a Duration object.")
            })?;

        let result = duration
            .inner
            .as_temporal_string(ToStringRoundingOptions::default())?;

        Ok(JsString::from(result).into())
    }

    /// 7.3.25 `Temporal.Duration.prototype.valueOf ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.duration.prototype.valueof
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration/valueOf
    pub(crate) fn value_of(_this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Err(JsNativeError::typ()
            .with_message("`valueOf` not supported by Temporal built-ins. See 'compare', 'equals', or `toString`")
            .into())
    }
}

// -- Duration Abstract Operations --

/// 7.5.12 `ToTemporalDuration ( item )`
pub(crate) fn to_temporal_duration(
    item: &JsValue,
    context: &mut Context,
) -> JsResult<InnerDuration> {
    // 1a. If Type(item) is Object
    // 1b. and item has an [[InitializedTemporalDuration]] internal slot, then
    let object = item.as_object();
    if let Some(duration) = object.as_ref().and_then(JsObject::downcast_ref::<Duration>) {
        return Ok(*duration.inner);
    }

    // 2. Let result be ? ToTemporalDurationRecord(item).
    let result = to_temporal_duration_record(item, context)?;
    // 3. Return ! CreateTemporalDuration(result.[[Years]], result.[[Months]], result.[[Weeks]], result.[[Days]], result.[[Hours]], result.[[Minutes]], result.[[Seconds]], result.[[Milliseconds]], result.[[Microseconds]], result.[[Nanoseconds]]).
    Ok(result)
}

/// 7.5.13 `ToTemporalDurationRecord ( temporalDurationLike )`
pub(crate) fn to_temporal_duration_record(
    temporal_duration_like: &JsValue,
    context: &mut Context,
) -> JsResult<InnerDuration> {
    // 1. If Type(temporalDurationLike) is not Object, then
    let Some(duration_obj) = temporal_duration_like.as_object() else {
        // a. If temporalDurationLike is not a String, throw a TypeError exception.
        let Some(duration_string) = temporal_duration_like.as_string() else {
            return Err(JsNativeError::typ()
                .with_message("Invalid TemporalDurationLike value.")
                .into());
        };

        // b. Return ? ParseTemporalDurationString(temporalDurationLike).
        return duration_string
            .to_std_string_escaped()
            .parse::<InnerDuration>()
            .map_err(Into::into);
    };

    // 2. If temporalDurationLike has an [[InitializedTemporalDuration]] internal slot, then
    if let Some(duration) = duration_obj.downcast_ref::<Duration>() {
        // a. Return ! CreateDurationRecord(temporalDurationLike.[[Years]], temporalDurationLike.[[Months]], temporalDurationLike.[[Weeks]], temporalDurationLike.[[Days]], temporalDurationLike.[[Hours]], temporalDurationLike.[[Minutes]], temporalDurationLike.[[Seconds]], temporalDurationLike.[[Milliseconds]], temporalDurationLike.[[Microseconds]], temporalDurationLike.[[Nanoseconds]]).
        return Ok(*duration.inner);
    }

    // 3. Let result be a new Duration Record with each field set to 0.
    // 4. Let partial be ? ToTemporalPartialDurationRecord(temporalDurationLike).
    let partial = to_temporal_partial_duration(temporal_duration_like, context)?;

    // 5. If partial.[[Years]] is not undefined, set result.[[Years]] to partial.[[Years]].

    // 6. If partial.[[Months]] is not undefined, set result.[[Months]] to partial.[[Months]].
    // 7. If partial.[[Weeks]] is not undefined, set result.[[Weeks]] to partial.[[Weeks]].
    // 8. If partial.[[Days]] is not undefined, set result.[[Days]] to partial.[[Days]].
    // 9. If partial.[[Hours]] is not undefined, set result.[[Hours]] to partial.[[Hours]].
    // 10. If partial.[[Minutes]] is not undefined, set result.[[Minutes]] to partial.[[Minutes]].
    // 11. If partial.[[Seconds]] is not undefined, set result.[[Seconds]] to partial.[[Seconds]].
    // 12. If partial.[[Milliseconds]] is not undefined, set result.[[Milliseconds]] to partial.[[Milliseconds]].
    // 13. If partial.[[Microseconds]] is not undefined, set result.[[Microseconds]] to partial.[[Microseconds]].
    // 14. If partial.[[Nanoseconds]] is not undefined, set result.[[Nanoseconds]] to partial.[[Nanoseconds]].
    // 15. If ! IsValidDuration(result.[[Years]], result.[[Months]], result.[[Weeks]], result.[[Days]], result.[[Hours]], result.[[Minutes]], result.[[Seconds]], result.[[Milliseconds]], result.[[Microseconds]], result.[[Nanoseconds]]) is false, then
    // a. Throw a RangeError exception.
    // 16. Return result.
    InnerDuration::from_partial_duration(partial).map_err(Into::into)
}

/// 7.5.14 `CreateTemporalDuration ( years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds [ , newTarget ] )`
pub(crate) fn create_temporal_duration(
    inner: InnerDuration,
    new_target: Option<&JsValue>,
    context: &mut Context,
) -> JsResult<JsObject> {
    // 1. If ! IsValidDuration(years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds) is false, throw a RangeError exception.

    // 2. If newTarget is not present, set newTarget to %Temporal.Duration%.
    let new_target = if let Some(target) = new_target {
        target.clone()
    } else {
        context
            .realm()
            .intrinsics()
            .constructors()
            .duration()
            .constructor()
            .into()
    };

    // 3. Let object be ? OrdinaryCreateFromConstructor(newTarget, "%Temporal.Duration.prototype%", « [[InitializedTemporalDuration]], [[Years]], [[Months]], [[Weeks]], [[Days]], [[Hours]], [[Minutes]], [[Seconds]], [[Milliseconds]], [[Microseconds]], [[Nanoseconds]] »).
    let prototype =
        get_prototype_from_constructor(&new_target, StandardConstructors::duration, context)?;

    // 4. Set object.[[Years]] to ℝ(𝔽(years)).
    // 5. Set object.[[Months]] to ℝ(𝔽(months)).
    // 6. Set object.[[Weeks]] to ℝ(𝔽(weeks)).
    // 7. Set object.[[Days]] to ℝ(𝔽(days)).
    // 8. Set object.[[Hours]] to ℝ(𝔽(hours)).
    // 9. Set object.[[Minutes]] to ℝ(𝔽(minutes)).
    // 10. Set object.[[Seconds]] to ℝ(𝔽(seconds)).
    // 11. Set object.[[Milliseconds]] to ℝ(𝔽(milliseconds)).
    // 12. Set object.[[Microseconds]] to ℝ(𝔽(microseconds)).
    // 13. Set object.[[Nanoseconds]] to ℝ(𝔽(nanoseconds)).

    let obj = JsObject::from_proto_and_data(prototype, Duration::new(inner));
    // 14. Return object.
    Ok(obj)
}

/// Equivalent to 7.5.13 `ToTemporalPartialDurationRecord ( temporalDurationLike )`
pub(crate) fn to_temporal_partial_duration(
    duration_like: &JsValue,
    context: &mut Context,
) -> JsResult<PartialDuration> {
    // 1. If Type(temporalDurationLike) is not Object, then
    let Some(unknown_object) = duration_like.as_object() else {
        // a. Throw a TypeError exception.
        return Err(JsNativeError::typ()
            .with_message("temporalDurationLike must be an object.")
            .into());
    };

    // 2. Let result be a new partial Duration Record with each field set to undefined.
    // 3. NOTE: The following steps read properties and perform independent validation in alphabetical order.
    // 4. Let days be ? Get(temporalDurationLike, "days").
    // 5. If days is not undefined, set result.[[Days]] to ? ToIntegerIfIntegral(days).
    let days = unknown_object
        .get(js_string!("days"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_integer_if_integral::<i64>()
                .map_err(JsError::from)
        })
        .transpose()?;

    // 6. Let hours be ? Get(temporalDurationLike, "hours").
    // 7. If hours is not undefined, set result.[[Hours]] to ? ToIntegerIfIntegral(hours).
    let hours = unknown_object
        .get(js_string!("hours"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_integer_if_integral::<i64>()
                .map_err(JsError::from)
        })
        .transpose()?;

    // 8. Let microseconds be ? Get(temporalDurationLike, "microseconds").
    // 9. If microseconds is not undefined, set result.[[Microseconds]] to ? ToIntegerIfIntegral(microseconds).
    let microseconds = unknown_object
        .get(js_string!("microseconds"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_integer_if_integral::<i128>()
                .map_err(JsError::from)
        })
        .transpose()?;

    // 10. Let milliseconds be ? Get(temporalDurationLike, "milliseconds").
    // 11. If milliseconds is not undefined, set result.[[Milliseconds]] to ? ToIntegerIfIntegral(milliseconds).
    let milliseconds = unknown_object
        .get(js_string!("milliseconds"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_integer_if_integral::<i64>()
                .map_err(JsError::from)
        })
        .transpose()?;

    // 12. Let minutes be ? Get(temporalDurationLike, "minutes").
    // 13. If minutes is not undefined, set result.[[Minutes]] to ? ToIntegerIfIntegral(minutes).
    let minutes = unknown_object
        .get(js_string!("minutes"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_integer_if_integral::<i64>()
                .map_err(JsError::from)
        })
        .transpose()?;

    // 14. Let months be ? Get(temporalDurationLike, "months").
    // 15. If months is not undefined, set result.[[Months]] to ? ToIntegerIfIntegral(months).
    let months = unknown_object
        .get(js_string!("months"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_integer_if_integral::<i64>()
                .map_err(JsError::from)
        })
        .transpose()?;

    // 16. Let nanoseconds be ? Get(temporalDurationLike, "nanoseconds").
    // 17. If nanoseconds is not undefined, set result.[[Nanoseconds]] to ? ToIntegerIfIntegral(nanoseconds).
    let nanoseconds = unknown_object
        .get(js_string!("nanoseconds"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_integer_if_integral::<i128>()
                .map_err(JsError::from)
        })
        .transpose()?;

    // 18. Let seconds be ? Get(temporalDurationLike, "seconds").
    // 19. If seconds is not undefined, set result.[[Seconds]] to ? ToIntegerIfIntegral(seconds).
    let seconds = unknown_object
        .get(js_string!("seconds"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_integer_if_integral::<i64>()
                .map_err(JsError::from)
        })
        .transpose()?;

    // 20. Let weeks be ? Get(temporalDurationLike, "weeks").
    // 21. If weeks is not undefined, set result.[[Weeks]] to ? ToIntegerIfIntegral(weeks).
    let weeks = unknown_object
        .get(js_string!("weeks"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_integer_if_integral::<i64>()
                .map_err(JsError::from)
        })
        .transpose()?;

    // 22. Let years be ? Get(temporalDurationLike, "years").
    // 23. If years is not undefined, set result.[[Years]] to ? ToIntegerIfIntegral(years).
    let years = unknown_object
        .get(js_string!("years"), context)?
        .map(|v| {
            let finite = v.to_finitef64(context)?;
            finite
                .as_integer_if_integral::<i64>()
                .map_err(JsError::from)
        })
        .transpose()?;

    let partial = PartialDuration {
        years,
        months,
        weeks,
        days,
        hours,
        minutes,
        seconds,
        milliseconds,
        microseconds,
        nanoseconds,
    };

    // 24. If years is undefined, and months is undefined, and weeks is undefined, and days
    // is undefined, and hours is undefined, and minutes is undefined, and seconds is
    // undefined, and milliseconds is undefined, and microseconds is undefined, and
    // nanoseconds is undefined, throw a TypeError exception.
    if partial.is_empty() {
        return Err(JsNativeError::typ()
            .with_message("PartialDurationRecord must have a defined field.")
            .into());
    }

    // 25. Return result.
    Ok(partial)
}
