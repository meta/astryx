//! Boa's implementation of the ECMAScript `Temporal.PlainTime` built-in object.

use super::{
    PlainDateTime, ZonedDateTime, create_temporal_duration,
    options::{TemporalUnitGroup, get_difference_settings, get_temporal_unit},
    to_temporal_duration_record,
};
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
use crate::{builtins::temporal::options::get_digits_option, value::JsVariant};
use boa_gc::{Finalize, Trace};
use num_traits::{AsPrimitive, PrimInt};
use temporal_rs::{
    PlainTime as PlainTimeInner,
    options::{
        Overflow, RoundingIncrement, RoundingMode, RoundingOptions, ToStringRoundingOptions, Unit,
    },
    partial::PartialTime,
    primitive::FiniteF64,
};

#[cfg(test)]
mod tests;

/// The `Temporal.PlainTime` built-in implementation.
///
/// More information:
///
/// - [ECMAScript Temporal proposal][spec]
/// - [MDN reference][mdn]
/// - [`temporal_rs` documentation][temporal_rs-docs]
///
/// [spec]: https://tc39.es/proposal-temporal/#sec-temporal-plaintime-objects
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainTime
/// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainTime.html
#[derive(Debug, Clone, Copy, Trace, Finalize, JsData)]
#[boa_gc(unsafe_empty_trace)] // Safety: PlainTimeInner does not contain any traceable types.
pub struct PlainTime {
    inner: PlainTimeInner,
}

impl BuiltInObject for PlainTime {
    const NAME: JsString = StaticJsStrings::PLAIN_TIME_NAME;
}

impl IntrinsicObject for PlainTime {
    fn init(realm: &Realm) {
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

        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .property(
                JsSymbol::to_string_tag(),
                StaticJsStrings::PLAIN_TIME_TAG,
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
            .static_method(Self::from, js_string!("from"), 1)
            .static_method(Self::compare, js_string!("compare"), 2)
            .method(Self::add, js_string!("add"), 1)
            .method(Self::subtract, js_string!("subtract"), 1)
            .method(Self::with, js_string!("with"), 1)
            .method(Self::until, js_string!("until"), 1)
            .method(Self::since, js_string!("since"), 1)
            .method(Self::round, js_string!("round"), 1)
            .method(Self::equals, js_string!("equals"), 1)
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

impl BuiltInConstructor for PlainTime {
    const CONSTRUCTOR_ARGUMENTS: usize = 0;
    const PROTOTYPE_STORAGE_SLOTS: usize = 24;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 2;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::plain_time;

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

        // 2. If hour is undefined, set hour to 0; else set hour to ? ToIntegerWithTruncation(hour).
        let hour = args.get_or_undefined(0).map_or(Ok::<u8, JsError>(0), |v| {
            let finite = v.to_finitef64(context)?;
            let int = finite.as_integer_with_truncation::<i8>();
            if int < 0 {
                return Err(JsNativeError::range()
                    .with_message("invalid time field")
                    .into());
            }
            Ok(int as u8)
        })?;
        // 3. If minute is undefined, set minute to 0; else set minute to ? ToIntegerWithTruncation(minute).
        let minute = args.get_or_undefined(1).map_or(Ok::<u8, JsError>(0), |v| {
            let finite = v.to_finitef64(context)?;
            let int = finite.as_integer_with_truncation::<i8>();
            if int < 0 {
                return Err(JsNativeError::range()
                    .with_message("invalid time field")
                    .into());
            }
            Ok(int as u8)
        })?;
        // 4. If second is undefined, set second to 0; else set second to ? ToIntegerWithTruncation(second).
        let second = args.get_or_undefined(2).map_or(Ok::<u8, JsError>(0), |v| {
            let finite = v.to_finitef64(context)?;
            let int = finite.as_integer_with_truncation::<i8>();
            if int < 0 {
                return Err(JsNativeError::range()
                    .with_message("invalid time field")
                    .into());
            }
            Ok(int as u8)
        })?;

        // 5. If millisecond is undefined, set millisecond to 0; else set millisecond to ? ToIntegerWithTruncation(millisecond).
        let millisecond = args
            .get_or_undefined(3)
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

        // 6. If microsecond is undefined, set microsecond to 0; else set microsecond to ? ToIntegerWithTruncation(microsecond).
        let microsecond = args
            .get_or_undefined(4)
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

        // 7. If nanosecond is undefined, set nanosecond to 0; else set nanosecond to ? ToIntegerWithTruncation(nanosecond).
        let nanosecond = args
            .get_or_undefined(5)
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

        let inner =
            PlainTimeInner::try_new(hour, minute, second, millisecond, microsecond, nanosecond)?;

        // 8. Return ? CreateTemporalTime(hour, minute, second, millisecond, microsecond, nanosecond, NewTarget).
        create_temporal_time(inner, Some(new_target), context).map(Into::into)
    }
}

// ==== PlainTime accessor methods implementation ====

impl PlainTime {
    /// 4.3.3 get `Temporal.PlainTime.prototype.hour`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaintime.prototype.hour
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainTime/hour
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainTime.html#method.hour
    fn get_hour(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let temporalTime be the this value.
        // 2. Perform ? RequireInternalSlot(temporalTime, [[InitializedTemporalTime]]).
        let object = this.as_object();
        let time = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainTime object.")
            })?;

        // 3. Return 𝔽(temporalTime.[[ISOHour]]).
        Ok(time.inner.hour().into())
    }

    /// 4.3.4 get `Temporal.PlainTime.prototype.minute`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaintime.prototype.minute
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainTime/minute
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainTime.html#method.minute
    fn get_minute(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let temporalTime be the this value.
        // 2. Perform ? RequireInternalSlot(temporalTime, [[InitializedTemporalTime]]).
        let object = this.as_object();
        let time = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainTime object.")
            })?;

        // 3. Return 𝔽(temporalTime.[[ISOMinute]]).
        Ok(time.inner.minute().into())
    }

    /// 4.3.5 get `Temporal.PlainTime.prototype.second`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaintime.prototype.second
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainTime/second
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainTime.html#method.second
    fn get_second(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let temporalTime be the this value.
        // 2. Perform ? RequireInternalSlot(temporalTime, [[InitializedTemporalTime]]).
        let object = this.as_object();
        let time = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainTime object.")
            })?;

        // 3. Return 𝔽(temporalTime.[[ISOSecond]]).
        Ok(time.inner.second().into())
    }

    /// 4.3.6 get `Temporal.PlainTime.prototype.millisecond`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaintime.prototype.millisecond
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainTime/millisecond
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainTime.html#method.millisecond
    fn get_millisecond(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let temporalTime be the this value.
        // 2. Perform ? RequireInternalSlot(temporalTime, [[InitializedTemporalTime]]).
        let object = this.as_object();
        let time = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainTime object.")
            })?;

        // 3. Return 𝔽(temporalTime.[[ISOMillisecond]]).
        Ok(time.inner.millisecond().into())
    }

    /// 4.3.7 get `Temporal.PlainTime.prototype.microsecond`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaintime.prototype.microsecond
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainTime/microsecond
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainTime.html#method.microsecond
    fn get_microsecond(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let temporalTime be the this value.
        // 2. Perform ? RequireInternalSlot(temporalTime, [[InitializedTemporalTime]]).
        let object = this.as_object();
        let time = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainTime object.")
            })?;

        // 3. Return 𝔽(temporalTime.[[ISOMicrosecond]]).
        Ok(time.inner.microsecond().into())
    }

    /// 4.3.8 get `Temporal.PlainTime.prototype.nanosecond`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plaintime.prototype.nanosecond
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainTime/nanosecond
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainTime.html#method.nanosecond
    fn get_nanosecond(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let temporalTime be the this value.
        // 2. Perform ? RequireInternalSlot(temporalTime, [[InitializedTemporalTime]]).
        let object = this.as_object();
        let time = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainTime object.")
            })?;

        // 3. Return 𝔽(temporalTime.[[ISONanosecond]]).
        Ok(time.inner.nanosecond().into())
    }
}

// ==== PlainTime static methods implementation ====

impl PlainTime {
    /// 4.2.2 `Temporal.PlainTime.from ( item [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaintime.from
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainTime/from
    fn from(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Return ? ToTemporalTime(item, options).
        let plain_time = to_temporal_time(args.get_or_undefined(0), args.get(1), context)?;
        create_temporal_time(plain_time, None, context).map(Into::into)
    }

    /// 4.2.3 `Temporal.PlainTime.compare ( one, two )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaintime.compare
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainTime/compare
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainTime.html#impl-Ord-for-PlainTime
    fn compare(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Set one to ? ToTemporalTime(one).
        let one = to_temporal_time(args.get_or_undefined(0), None, context)?;
        // 2. Set two to ? ToTemporalTime(two).
        let two = to_temporal_time(args.get_or_undefined(1), None, context)?;
        // 3. Return 𝔽(CompareTemporalTime(one.[[ISOHour]], one.[[ISOMinute]], one.[[ISOSecond]],
        // one.[[ISOMillisecond]], one.[[ISOMicrosecond]], one.[[ISONanosecond]], two.[[ISOHour]],
        // two.[[ISOMinute]], two.[[ISOSecond]], two.[[ISOMillisecond]], two.[[ISOMicrosecond]],
        // two.[[ISONanosecond]])).
        Ok((one.cmp(&two) as i8).into())
    }
}

// ==== PlainTime.prototype method implementations ====

impl PlainTime {
    /// 4.3.9 `Temporal.PlainTime.prototype.add ( temporalDurationLike )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaintime.prototype.add
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainTime/add
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainTime.html#method.add
    fn add(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let temporalTime be the this value.
        // 2. Perform ? RequireInternalSlot(temporalTime, [[InitializedTemporalTime]]).
        let object = this.as_object();
        let time = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainTime object.")
            })?;

        let temporal_duration_like = args.get_or_undefined(0);
        let duration = to_temporal_duration_record(temporal_duration_like, context)?;

        // 3. Return ? AddDurationToOrSubtractDurationFromPlainTime(add, temporalTime, temporalDurationLike).
        create_temporal_time(time.inner.add(&duration)?, None, context).map(Into::into)
    }

    /// 4.3.10 `Temporal.PlainTime.prototype.subtract ( temporalDurationLike )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaintime.prototype.subtract
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainTime/subtract
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainTime.html#method.subtract
    fn subtract(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let temporalTime be the this value.
        // 2. Perform ? RequireInternalSlot(temporalTime, [[InitializedTemporalTime]]).
        let object = this.as_object();
        let time = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainTime object.")
            })?;

        let temporal_duration_like = args.get_or_undefined(0);
        let duration = to_temporal_duration_record(temporal_duration_like, context)?;

        // 3. Return ? AddDurationToOrSubtractDurationFromPlainTime(subtract, temporalTime, temporalDurationLike).
        create_temporal_time(time.inner.subtract(&duration)?, None, context).map(Into::into)
    }

    /// 4.3.11 `Temporal.PlainTime.prototype.with ( temporalTimeLike [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaintime.prototype.with
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainTime/with
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainTime.html#method.with
    fn with(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1.Let temporalTime be the this value.
        // 2. Perform ? RequireInternalSlot(temporalTime, [[InitializedTemporalTime]]).
        let object = this.as_object();
        let time = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainTime object.")
            })?;

        // 3. If ? IsPartialTemporalObject(temporalTimeLike) is false, throw a TypeError exception.
        // 4. Set options to ? GetOptionsObject(options).
        let Some(partial_object) =
            super::is_partial_temporal_object(args.get_or_undefined(0), context)?
        else {
            return Err(JsNativeError::typ()
                .with_message("with object was not a PartialTemporalObject.")
                .into());
        };

        // Steps 5-16 equate to the below
        let partial = to_js_partial_time_record(&partial_object, context)?;
        // 17. Let resolvedOptions be ? GetOptionsObject(options).
        // 18. Let overflow be ? GetTemporalOverflowOption(resolvedOptions).
        let options = get_options_object(args.get_or_undefined(1))?;
        let overflow = get_option::<Overflow>(&options, js_string!("overflow"), context)?;

        create_temporal_time(
            time.inner
                .with(partial.as_temporal_partial_time(overflow)?, overflow)?,
            None,
            context,
        )
        .map(Into::into)
    }

    /// 4.3.12 `Temporal.PlainTime.prototype.until ( other [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaintime.prototype.until
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainTime/until
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainTime.html#method.until
    fn until(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let time = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainTime object.")
            })?;

        let other = to_temporal_time(args.get_or_undefined(0), None, context)?;

        let settings =
            get_difference_settings(&get_options_object(args.get_or_undefined(1))?, context)?;

        let result = time.inner.until(&other, settings)?;

        create_temporal_duration(result, None, context).map(Into::into)
    }

    /// 4.3.13 `Temporal.PlainTime.prototype.since ( other [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaintime.prototype.since
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainTime/since
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainTime.html#method.since
    fn since(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let time = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainTime object.")
            })?;

        let other = to_temporal_time(args.get_or_undefined(0), None, context)?;

        let settings =
            get_difference_settings(&get_options_object(args.get_or_undefined(1))?, context)?;

        let result = time.inner.since(&other, settings)?;

        create_temporal_duration(result, None, context).map(Into::into)
    }

    /// 4.3.14 Temporal.PlainTime.prototype.round ( roundTo )
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaintime.prototype.round
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainTime/round
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainTime.html#method.round
    fn round(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let temporalTime be the this value.
        // 2. Perform ? RequireInternalSlot(temporalTime, [[InitializedTemporalTime]]).
        let object = this.as_object();
        let time = object
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
        // 6. NOTE: The following steps read options and perform independent validation in alphabetical order (ToTemporalRoundingIncrement reads "roundingIncrement" and ToTemporalRoundingMode reads "roundingMode").
        // 7. Let roundingIncrement be ? ToTemporalRoundingIncrement(roundTo).
        options.increment =
            get_option::<RoundingIncrement>(&round_to, js_string!("roundingIncrement"), context)?;

        // 8. Let roundingMode be ? ToTemporalRoundingMode(roundTo, "halfExpand").
        options.rounding_mode =
            get_option::<RoundingMode>(&round_to, js_string!("roundingMode"), context)?;

        // 9. Let smallestUnit be ? GetTemporalUnit(roundTo, "smallestUnit", time, required).
        options.smallest_unit = get_temporal_unit(
            &round_to,
            js_string!("smallestUnit"),
            TemporalUnitGroup::Time,
            None,
            context,
        )?;

        // 10. Let maximum be MaximumTemporalDurationRoundingIncrement(smallestUnit).
        // 11. Assert: maximum is not undefined.
        // 12. Perform ? ValidateTemporalRoundingIncrement(roundingIncrement, maximum, false).
        // 13. Let result be RoundTime(temporalTime.[[ISOHour]], temporalTime.[[ISOMinute]], temporalTime.[[ISOSecond]], temporalTime.[[ISOMillisecond]], temporalTime.[[ISOMicrosecond]], temporalTime.[[ISONanosecond]], roundingIncrement, smallestUnit, roundingMode).
        let result = time.inner.round(options)?;

        // 14. Return ! CreateTemporalTime(result.[[Hour]], result.[[Minute]], result.[[Second]], result.[[Millisecond]], result.[[Microsecond]], result.[[Nanosecond]]).
        create_temporal_time(result, None, context).map(Into::into)
    }

    /// 4.3.15 Temporal.PlainTime.prototype.equals ( other )
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaintime.prototype.equals
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainTime/equals
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainTime.html#impl-Eq-for-PlainTime
    fn equals(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let temporalTime be the this value.
        // 2. Perform ? RequireInternalSlot(temporalTime, [[InitializedTemporalTime]]).
        let object = this.as_object();
        let time = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainTime object.")
            })?;

        // 3. Set other to ? ToTemporalTime(other).
        let other = to_temporal_time(args.get_or_undefined(0), None, context)?;
        // 4. If temporalTime.[[ISOHour]] ≠ other.[[ISOHour]], return false.
        // 5. If temporalTime.[[ISOMinute]] ≠ other.[[ISOMinute]], return false.
        // 6. If temporalTime.[[ISOSecond]] ≠ other.[[ISOSecond]], return false.
        // 7. If temporalTime.[[ISOMillisecond]] ≠ other.[[ISOMillisecond]], return false.
        // 8. If temporalTime.[[ISOMicrosecond]] ≠ other.[[ISOMicrosecond]], return false.
        // 9. If temporalTime.[[ISONanosecond]] ≠ other.[[ISONanosecond]], return false.
        // 10. Return true.
        Ok((time.inner == other).into())
    }

    /// 4.3.16 `Temporal.PlainTime.prototype.toString ( [ options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaintime.prototype.tostring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainTime/toString
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainTime.html#method.to_ixdtf_string
    fn to_string(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let time = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainTime object.")
            })?;

        let options = get_options_object(args.get_or_undefined(0))?;

        let precision = get_digits_option(&options, context)?;
        let rounding_mode =
            get_option::<RoundingMode>(&options, js_string!("roundingMode"), context)?;
        let smallest_unit = get_option::<Unit>(&options, js_string!("smallestUnit"), context)?;

        let options = ToStringRoundingOptions {
            precision,
            rounding_mode,
            smallest_unit,
        };

        let ixdtf = time.inner.to_ixdtf_string(options)?;

        Ok(JsString::from(ixdtf).into())
    }

    /// 4.3.17 `Temporal.PlainTime.prototype.toLocaleString ( [ locales [ , options ] ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaintime.prototype.tolocalestring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainTime/toLocaleString
    fn to_locale_string(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // TODO: Update for ECMA-402 compliance
        let object = this.as_object();
        let time = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainTime object.")
            })?;

        let ixdtf = time
            .inner
            .to_ixdtf_string(ToStringRoundingOptions::default())?;
        Ok(JsString::from(ixdtf).into())
    }

    /// 4.3.18 `Temporal.PlainTime.prototype.toJSON ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaintime.prototype.tojson
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainTime/toJSON
    fn to_json(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let time = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be a PlainTime object.")
            })?;

        let ixdtf = time
            .inner
            .to_ixdtf_string(ToStringRoundingOptions::default())?;
        Ok(JsString::from(ixdtf).into())
    }

    /// 4.3.19 `Temporal.PlainTime.prototype.valueOf ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plaintime.prototype.valueof
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainTime/valueOf
    fn value_of(_this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Throw a TypeError exception.
        Err(JsNativeError::typ()
            .with_message("`valueOf` not supported by Temporal built-ins. See 'compare', 'equals', or `toString`")
            .into())
    }
}

// ==== PlainTime Abstract Operations ====

pub(crate) fn create_temporal_time(
    inner: PlainTimeInner,
    new_target: Option<&JsValue>,
    context: &mut Context,
) -> JsResult<JsObject> {
    // Note: IsValidTime is enforced by Time.
    // 1. If IsValidTime(hour, minute, second, millisecond, microsecond, nanosecond) is false, throw a RangeError exception.

    // 2. If newTarget is not present, set newTarget to %Temporal.PlainTime%.
    let new_target = if let Some(new_target) = new_target {
        new_target.clone()
    } else {
        context
            .realm()
            .intrinsics()
            .constructors()
            .plain_time()
            .constructor()
            .into()
    };

    // 3. Let object be ? OrdinaryCreateFromConstructor(newTarget, "%Temporal.PlainTime.prototype%", « [[InitializedTemporalTime]], [[ISOHour]], [[ISOMinute]], [[ISOSecond]], [[ISOMillisecond]], [[ISOMicrosecond]], [[ISONanosecond]] »).
    let prototype =
        get_prototype_from_constructor(&new_target, StandardConstructors::plain_time, context)?;

    // 4. Set object.[[ISOHour]] to hour.
    // 5. Set object.[[ISOMinute]] to minute.
    // 6. Set object.[[ISOSecond]] to second.
    // 7. Set object.[[ISOMillisecond]] to millisecond.
    // 8. Set object.[[ISOMicrosecond]] to microsecond.
    // 9. Set object.[[ISONanosecond]] to nanosecond.
    let obj = JsObject::from_proto_and_data(prototype, PlainTime { inner });

    // 10. Return object.
    Ok(obj)
}

/// 4.5.3 `ToTemporalTime ( item [ , overflow ] )`
pub(crate) fn to_temporal_time(
    value: &JsValue,
    options: Option<&JsValue>,
    context: &mut Context,
) -> JsResult<PlainTimeInner> {
    // 1.If overflow is not present, set overflow to "constrain".
    let binding = JsValue::undefined();
    let options = options.unwrap_or(&binding);
    // 2. If item is an Object, then
    match value.variant() {
        JsVariant::Object(object) => {
            // a. If item has an [[InitializedTemporalTime]] internal slot, then
            if let Some(time) = object.downcast_ref::<PlainTime>() {
                // i. Return item.
                let options = get_options_object(options)?;
                let _overflow = get_option::<Overflow>(&options, js_string!("overflow"), context)?;
                return Ok(time.inner);
            // b. If item has an [[InitializedTemporalZonedDateTime]] internal slot, then
            } else if let Some(zdt) = object.downcast_ref::<ZonedDateTime>() {
                // i. Let instant be ! CreateTemporalInstant(item.[[Nanoseconds]]).
                // ii. Let timeZoneRec be ? CreateTimeZoneMethodsRecord(item.[[TimeZone]], « get-offset-nanoseconds-for »).
                // iii. Let plainDateTime be ? GetPlainDateTimeFor(timeZoneRec, instant, item.[[Calendar]]).
                // iv. Return ! CreateTemporalTime(plainDateTime.[[ISOHour]], plainDateTime.[[ISOMinute]],
                // plainDateTime.[[ISOSecond]], plainDateTime.[[ISOMillisecond]], plainDateTime.[[ISOMicrosecond]],
                // plainDateTime.[[ISONanosecond]]).
                let options = get_options_object(options)?;
                let _overflow = get_option::<Overflow>(&options, js_string!("overflow"), context)?;
                return Ok(zdt.inner.to_plain_time());
            // c. If item has an [[InitializedTemporalDateTime]] internal slot, then
            } else if let Some(dt) = object.downcast_ref::<PlainDateTime>() {
                // i. Return ! CreateTemporalTime(item.[[ISOHour]], item.[[ISOMinute]],
                // item.[[ISOSecond]], item.[[ISOMillisecond]], item.[[ISOMicrosecond]],
                // item.[[ISONanosecond]]).
                let options = get_options_object(options)?;
                let _overflow = get_option::<Overflow>(&options, js_string!("overflow"), context)?;
                return Ok(PlainTimeInner::from(dt.inner.clone()));
            }
            // d. Let result be ? ToTemporalTimeRecord(item).
            // e. Set result to ? RegulateTime(result.[[Hour]], result.[[Minute]],
            // result.[[Second]], result.[[Millisecond]], result.[[Microsecond]],
            // result.[[Nanosecond]], overflow).
            let partial = to_js_partial_time_record(&object, context)?;

            let options = get_options_object(options)?;
            let overflow = get_option::<Overflow>(&options, js_string!("overflow"), context)?;

            PlainTimeInner::from_partial(partial.as_temporal_partial_time(overflow)?, overflow)
                .map_err(Into::into)
        }
        // 3. Else,
        JsVariant::String(str) => {
            // b. Let result be ? ParseTemporalTimeString(item).
            // c. Assert: IsValidTime(result.[[Hour]], result.[[Minute]], result.[[Second]], result.[[Millisecond]], result.[[Microsecond]], result.[[Nanosecond]]) is true.
            let result = str.to_std_string_escaped().parse::<PlainTimeInner>()?;

            let options = get_options_object(options)?;
            let _overflow = get_option::<Overflow>(&options, js_string!("overflow"), context)?;

            Ok(result)
        }
        // a. If item is not a String, throw a TypeError exception.
        _ => Err(JsNativeError::typ()
            .with_message("Invalid value for converting to PlainTime.")
            .into()),
    }

    // 4. Return ! CreateTemporalTime(result.[[Hour]], result.[[Minute]], result.[[Second]], result.[[Millisecond]], result.[[Microsecond]], result.[[Nanosecond]]).
}

/// A `PartialTime` represents partially filled `Time` fields.
#[derive(Debug, Default, Clone, Copy, PartialEq)]
pub struct JsPartialTime {
    /// A potentially set `hour` field.
    pub hour: Option<FiniteF64>,
    /// A potentially set `minute` field.
    pub minute: Option<FiniteF64>,
    /// A potentially set `second` field.
    pub second: Option<FiniteF64>,
    /// A potentially set `millisecond` field.
    pub millisecond: Option<FiniteF64>,
    /// A potentially set `microsecond` field.
    pub microsecond: Option<FiniteF64>,
    /// A potentially set `nanosecond` field.
    pub nanosecond: Option<FiniteF64>,
}

impl JsPartialTime {
    fn as_temporal_partial_time(&self, overflow: Option<Overflow>) -> JsResult<PartialTime> {
        fn check(value: Option<FiniteF64>, typ: &'static str, max: u16) -> JsResult<()> {
            if let Some(value) = value
                && value.as_inner().is_sign_negative()
            {
                return Err(JsNativeError::range()
                    .with_message(format!("time value '{typ}' not in 0..{max}: {value}"))
                    .into());
            }
            Ok(())
        }

        fn truncate<T>(value: Option<FiniteF64>) -> Option<T>
        where
            T: PrimInt + AsPrimitive<f64>,
            f64: AsPrimitive<T>,
        {
            value
                .as_ref()
                .map(FiniteF64::as_integer_with_truncation::<T>)
        }

        if overflow == Some(Overflow::Reject) {
            check(self.hour, "hour", 23)?;
            check(self.minute, "minute", 59)?;
            check(self.second, "second", 59)?;
            check(self.millisecond, "millisecond", 999)?;
            check(self.microsecond, "microsecond", 999)?;
            check(self.nanosecond, "nanosecond", 999)?;
        }

        Ok(PartialTime::new()
            .with_hour(truncate(self.hour))
            .with_minute(truncate(self.minute))
            .with_second(truncate(self.second))
            .with_millisecond(truncate(self.millisecond))
            .with_microsecond(truncate(self.microsecond))
            .with_nanosecond(truncate(self.nanosecond)))
    }
}

pub(crate) fn to_js_partial_time_record(
    partial_object: &JsObject,
    context: &mut Context,
) -> JsResult<JsPartialTime> {
    let hour = partial_object
        .get(js_string!("hour"), context)?
        .map(|v| v.to_finitef64(context))
        .transpose()?;

    let microsecond = partial_object
        .get(js_string!("microsecond"), context)?
        .map(|v| v.to_finitef64(context))
        .transpose()?;

    let millisecond = partial_object
        .get(js_string!("millisecond"), context)?
        .map(|v| v.to_finitef64(context))
        .transpose()?;

    let minute = partial_object
        .get(js_string!("minute"), context)?
        .map(|v| v.to_finitef64(context))
        .transpose()?;

    let nanosecond = partial_object
        .get(js_string!("nanosecond"), context)?
        .map(|v| v.to_finitef64(context))
        .transpose()?;

    let second = partial_object
        .get(js_string!("second"), context)?
        .map(|v| v.to_finitef64(context))
        .transpose()?;

    Ok(JsPartialTime {
        hour,
        minute,
        second,
        millisecond,
        microsecond,
        nanosecond,
    })
}
