//! Boa's implementation of ECMAScript's `Temporal.Instant` built-in object.

use super::options::{get_difference_settings, get_digits_option};
use super::{create_temporal_zoneddatetime, to_temporal_timezone_identifier};
use crate::js_error;
use crate::{
    Context, JsArgs, JsBigInt, JsData, JsNativeError, JsObject, JsResult, JsString, JsSymbol,
    JsValue,
    builtins::{
        BuiltInBuilder, BuiltInConstructor, BuiltInObject, IntrinsicObject,
        options::{get_option, get_options_object},
        temporal::{
            ZonedDateTime,
            duration::{create_temporal_duration, to_temporal_duration_record},
            options::{TemporalUnitGroup, get_temporal_unit},
        },
    },
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    js_string,
    object::internal_methods::get_prototype_from_constructor,
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
    value::PreferredType,
};
use boa_gc::{Finalize, Trace};
use num_traits::ToPrimitive;
use temporal_rs::options::{ToStringRoundingOptions, Unit};
use temporal_rs::{
    Instant as InnerInstant,
    options::{RoundingIncrement, RoundingMode, RoundingOptions},
};

/// The `Temporal.Instant` built-in implementation
///
/// More information:
///
/// - [ECMAScript Temporal proposal][spec]
/// - [MDN reference][mdn]
/// - [`temporal_rs` documentation][temporal_rs-docs]
///
/// [spec]: https://tc39.es/proposal-temporal/#sec-temporal-instant-objects
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Instant
/// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Instant.html
#[derive(Debug, Clone, Trace, Finalize, JsData)]
#[boa_gc(unsafe_empty_trace)] // Safety: Does not contain any traceable fields.
pub struct Instant {
    pub(crate) inner: Box<InnerInstant>,
}

impl Instant {
    pub(crate) fn new(inner: InnerInstant) -> Self {
        Self {
            inner: Box::new(inner),
        }
    }
}

impl BuiltInObject for Instant {
    const NAME: JsString = StaticJsStrings::INSTANT_NAME;
}

impl IntrinsicObject for Instant {
    fn init(realm: &Realm) {
        let get_millis = BuiltInBuilder::callable(realm, Self::get_epoch_milliseconds)
            .name(js_string!("get epochMilliseconds"))
            .build();

        let get_nanos = BuiltInBuilder::callable(realm, Self::get_epoch_nanoseconds)
            .name(js_string!("get epochNanoseconds"))
            .build();

        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .property(
                JsSymbol::to_string_tag(),
                StaticJsStrings::INSTANT_TAG,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("epochMilliseconds"),
                Some(get_millis),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("epochNanoseconds"),
                Some(get_nanos),
                None,
                Attribute::CONFIGURABLE,
            )
            .static_method(Self::from, js_string!("from"), 1)
            .static_method(
                Self::from_epoch_milliseconds,
                js_string!("fromEpochMilliseconds"),
                1,
            )
            .static_method(
                Self::from_epoch_nanoseconds,
                js_string!("fromEpochNanoseconds"),
                1,
            )
            .static_method(Self::compare, js_string!("compare"), 2)
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
            .method(
                Self::to_zoned_date_time_iso,
                js_string!("toZonedDateTimeISO"),
                1,
            )
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInConstructor for Instant {
    const CONSTRUCTOR_ARGUMENTS: usize = 1;
    const PROTOTYPE_STORAGE_SLOTS: usize = 16;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 4;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::instant;

    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is undefined, then
        if new_target.is_undefined() {
            // a. Throw a TypeError exception.
            return Err(JsNativeError::typ()
                .with_message("Temporal.Instant new target cannot be undefined.")
                .into());
        }

        // 2. Let epochNanoseconds be ? ToBigInt(epochNanoseconds).
        let epoch_nanos = args.get_or_undefined(0).to_bigint(context)?;

        // 3. If ! IsValidEpochNanoseconds(epochNanoseconds) is false, throw a RangeError exception.
        // NOTE: temporal_rs::Instant asserts that the epochNanoseconds are valid.
        let instant = InnerInstant::try_new(epoch_nanos.as_inner().to_i128().unwrap_or(i128::MAX))?;
        // 4. Return ? CreateTemporalInstant(epochNanoseconds, NewTarget).
        create_temporal_instant(instant, Some(new_target.clone()), context)
    }
}

// ==== Instant static methods implementation ====

impl Instant {
    /// 8.2.2 Temporal.Instant.from ( item )
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.instant.from
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Instant/from
    pub(crate) fn from(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. If item is an Object and item has an [[InitializedTemporalInstant]] internal slot, then
        // a. Return ! CreateTemporalInstant(item.[[Nanoseconds]]).
        // 2. Return ? ToTemporalInstant(item).
        create_temporal_instant(
            to_temporal_instant(args.get_or_undefined(0), context)?,
            None,
            context,
        )
    }

    /// 8.2.3 `Temporal.Instant.fromEpochMilliseconds ( epochMilliseconds )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.instant.from
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Instant/from
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Instant.html#method.from_epoch_milliseconds
    pub(crate) fn from_epoch_milliseconds(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Set epochMilliseconds to ? ToNumber(epochMilliseconds).
        let epoch_millis_f64 = args.get_or_undefined(0).to_number(context)?;
        // NOTE: inline NumberToBigInt. It checks if the number is integral
        // 2. Set epochMilliseconds to ? NumberToBigInt(epochMilliseconds).
        if !epoch_millis_f64.is_finite() || epoch_millis_f64.fract() != 0.0 {
            return Err(js_error!(RangeError: "number is not integral"));
        }
        // 3. Let epochNanoseconds be epochMilliseconds × ℤ(10**6).
        // 4. If IsValidEpochNanoseconds(epochNanoseconds) is false, throw a RangeError exception.
        // 5. Return ! CreateTemporalInstant(epochNanoseconds).
        create_temporal_instant(
            InnerInstant::from_epoch_milliseconds(epoch_millis_f64.to_i64().unwrap_or(i64::MAX))?,
            None,
            context,
        )
    }

    /// 8.2.4 `Temporal.Instant.fromEpochNanoseconds ( epochNanoseconds )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.instant.from
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Instant/from
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Instant.html#method.try_new
    pub(crate) fn from_epoch_nanoseconds(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Set epochNanoseconds to ? ToBigInt(epochNanoseconds).
        let epoch_nanos = args.get_or_undefined(0).to_bigint(context)?;
        // 2. If IsValidEpochNanoseconds(epochNanoseconds) is false, throw a RangeError exception.
        // 3. Return ! CreateTemporalInstant(epochNanoseconds).
        let nanos = epoch_nanos.as_inner().to_i128();
        create_temporal_instant(
            InnerInstant::try_new(nanos.unwrap_or(i128::MAX))?,
            None,
            context,
        )
    }

    /// 8.2.5 Temporal.Instant.compare ( one, two )
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.instant.compare
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Instant/compare
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Instant.html#impl-PartialOrd-for-Instant
    pub(crate) fn compare(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Set one to ? ToTemporalInstant(one).
        let one = to_temporal_instant(args.get_or_undefined(0), context)?;
        // 2. Set two to ? ToTemporalInstant(two).
        let two = to_temporal_instant(args.get_or_undefined(1), context)?;
        // 3. Return 𝔽(CompareEpochNanoseconds(one.[[Nanoseconds]], two.[[Nanoseconds]])).
        Ok((one.cmp(&two) as i8).into())
    }
}

// ==== Instant accessors implementation ====

impl Instant {
    /// 8.3.4 get Temporal.Instant.prototype.epochMilliseconds
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.instant.epochmilliseconds
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Instant/epochmilliseconds
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Instant.html#method.epoch_milliseconds
    pub(crate) fn get_epoch_milliseconds(
        this: &JsValue,
        _: &[JsValue],
        _: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let instant be the this value.
        // 2. Perform ? RequireInternalSlot(instant, [[InitializedTemporalInstant]]).
        let object = this.as_object();
        let instant = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be an instant object.")
            })?;
        // 3. Let ns be instant.[[Nanoseconds]].
        // 4. Let ms be floor(ℝ(ns) / 10^6).
        // 5. Return 𝔽(ms).
        Ok(instant.inner.epoch_milliseconds().into())
    }

    /// 8.3.6 get Temporal.Instant.prototype.epochNanoseconds
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.instant.epochnanoseconds
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Instant/epochNanoseconds
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Instant.html#method.epoch_nanoseconds
    pub(crate) fn get_epoch_nanoseconds(
        this: &JsValue,
        _: &[JsValue],
        _: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let instant be the this value.
        // 2. Perform ? RequireInternalSlot(instant, [[InitializedTemporalInstant]]).
        let object = this.as_object();
        let instant = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be an instant object.")
            })?;
        // 3. Let ns be instant.[[Nanoseconds]].
        // 4. Return ns.
        Ok(JsBigInt::from(instant.inner.epoch_nanoseconds().as_i128()).into())
    }
}

// ==== Instant methods implementation ====

impl Instant {
    /// 8.3.7 `Temporal.Instant.prototype.add ( temporalDurationLike )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.instant.add
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Instant/add
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Instant.html#method.add
    pub(crate) fn add(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let instant be the this value.
        // 2. Perform ? RequireInternalSlot(instant, [[InitializedTemporalInstant]]).
        let object = this.as_object();
        let instant = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be an instant object.")
            })?;

        // 3. Return ? AddDurationToOrSubtractDurationFromInstant(add, instant, temporalDurationLike).
        let temporal_duration_like =
            to_temporal_duration_record(args.get_or_undefined(0), context)?;
        let result = instant.inner.add(&temporal_duration_like)?;
        create_temporal_instant(result, None, context)
    }

    /// 8.3.8 `Temporal.Instant.prototype.subtract ( temporalDurationLike )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.instant.subtract
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Instant/subtract
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Instant.html#method.subtract
    pub(crate) fn subtract(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let instant be the this value.
        // 2. Perform ? RequireInternalSlot(instant, [[InitializedTemporalInstant]]).
        let object = this.as_object();
        let instant = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be an instant object.")
            })?;

        // 3. Return ? AddDurationToOrSubtractDurationFromInstant(subtract, instant, temporalDurationLike).
        let temporal_duration_like =
            to_temporal_duration_record(args.get_or_undefined(0), context)?;
        let result = instant.inner.subtract(&temporal_duration_like)?;
        create_temporal_instant(result, None, context)
    }

    /// 8.3.9 `Temporal.Instant.prototype.until ( other [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.instant.until
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Instant/until
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Instant.html#method.until
    pub(crate) fn until(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let instant be the this value.
        // 2. Perform ? RequireInternalSlot(instant, [[InitializedTemporalInstant]]).
        let object = this.as_object();
        let instant = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be an instant object.")
            })?;

        // 3. Return ? DifferenceTemporalInstant(until, instant, other, options).
        let other = to_temporal_instant(args.get_or_undefined(0), context)?;

        // Fetch the necessary options.
        let settings =
            get_difference_settings(&get_options_object(args.get_or_undefined(1))?, context)?;
        let result = instant.inner.until(&other, settings)?;
        create_temporal_duration(result, None, context).map(Into::into)
    }

    /// 8.3.10 `Temporal.Instant.prototype.since ( other [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.instant.since
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Instant/since
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Instant.html#method.since
    pub(crate) fn since(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let instant be the this value.
        // 2. Perform ? RequireInternalSlot(instant, [[InitializedTemporalInstant]]).
        let object = this.as_object();
        let instant = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be an instant object.")
            })?;

        // 3. Return ? DifferenceTemporalInstant(since, instant, other, options).
        let other = to_temporal_instant(args.get_or_undefined(0), context)?;
        let settings =
            get_difference_settings(&get_options_object(args.get_or_undefined(1))?, context)?;
        let result = instant.inner.since(&other, settings)?;
        create_temporal_duration(result, None, context).map(Into::into)
    }

    /// 8.3.11 `Temporal.Instant.prototype.round ( roundTo )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.instant.round
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Instant/round
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Instant.html#method.round
    pub(crate) fn round(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let instant be the this value.
        // 2. Perform ? RequireInternalSlot(instant, [[InitializedTemporalInstant]]).
        let object = this.as_object();
        let instant = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be an instant object.")
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

        // 6. NOTE: The following steps read options and perform independent validation in
        // alphabetical order (ToTemporalRoundingIncrement reads "roundingIncrement" and ToTemporalRoundingMode reads "roundingMode").
        let mut options = RoundingOptions::default();
        // 7. Let roundingIncrement be ? ToTemporalRoundingIncrement(roundTo).
        options.increment =
            get_option::<RoundingIncrement>(&round_to, js_string!("roundingIncrement"), context)?;

        // 8. Let roundingMode be ? ToTemporalRoundingMode(roundTo, "halfExpand").
        options.rounding_mode =
            get_option::<RoundingMode>(&round_to, js_string!("roundingMode"), context)?;

        // 9. Let smallestUnit be ? GetTemporalUnit(roundTo, "smallestUnit"), time, required).
        let smallest_unit = get_temporal_unit(
            &round_to,
            js_string!("smallestUnit"),
            TemporalUnitGroup::Time,
            None,
            context,
        )?
        .ok_or_else(|| JsNativeError::range().with_message("smallestUnit cannot be undefined."))?;

        options.smallest_unit = Some(smallest_unit);

        // 10. If smallestUnit is "hour"), then
        // a. Let maximum be HoursPerDay.
        // 11. Else if smallestUnit is "minute"), then
        // a. Let maximum be MinutesPerHour × HoursPerDay.
        // 12. Else if smallestUnit is "second"), then
        // a. Let maximum be SecondsPerMinute × MinutesPerHour × HoursPerDay.
        // 13. Else if smallestUnit is "millisecond"), then
        // a. Let maximum be ℝ(msPerDay).
        // 14. Else if smallestUnit is "microsecond"), then
        // a. Let maximum be 10^3 × ℝ(msPerDay).
        // 15. Else,
        // a. Assert: smallestUnit is "nanosecond".
        // b. Let maximum be nsPerDay.
        // unreachable here functions as 15.a.
        // 16. Perform ? ValidateTemporalRoundingIncrement(roundingIncrement, maximum, true).
        // 17. Let roundedNs be RoundTemporalInstant(instant.[[Nanoseconds]], roundingIncrement, smallestUnit, roundingMode).
        let result = instant.inner.round(options)?;

        // 18. Return ! CreateTemporalInstant(roundedNs).
        create_temporal_instant(result, None, context)
    }

    /// 8.3.12 `Temporal.Instant.prototype.equals ( other )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.instant.equals
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Instant/equals
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Instant.html#impl-PartialEq-for-Instant
    pub(crate) fn equals(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let instant be the this value.
        // 2. Perform ? RequireInternalSlot(instant, [[InitializedTemporalInstant]]).
        // 4. If instant.[[Nanoseconds]] ≠ other.[[Nanoseconds]], return false.
        // 5. Return true.
        let object = this.as_object();
        let instant = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("the this object must be an instant object.")
            })?;

        // 3. Set other to ? ToTemporalInstant(other).
        let other = args.get_or_undefined(0);
        let other_instant = to_temporal_instant(other, context)?;

        if *instant.inner != other_instant {
            return Ok(false.into());
        }
        Ok(true.into())
    }

    /// 8.3.11 `Temporal.Instant.prototype.toString ( [ options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.instant.tostring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Instant/toString
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Instant.html#method.to_ixdtf_string
    fn to_string(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let instant = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ()
                    .with_message("the this object must be a Temporal.Instant object.")
            })?;

        let options = get_options_object(args.get_or_undefined(0))?;

        let precision = get_digits_option(&options, context)?;
        let rounding_mode =
            get_option::<RoundingMode>(&options, js_string!("roundingMode"), context)?;
        let smallest_unit = get_option::<Unit>(&options, js_string!("smallestUnit"), context)?;
        // NOTE: There may be an order-of-operations here due to a check on Unit groups and smallest_unit value.
        let timezone = options
            .get(js_string!("timeZone"), context)?
            .map(|v| to_temporal_timezone_identifier(v, context))
            .transpose()?;

        let options = ToStringRoundingOptions {
            precision,
            smallest_unit,
            rounding_mode,
        };

        let ixdtf = instant.inner.to_ixdtf_string_with_provider(
            timezone,
            options,
            context.timezone_provider(),
        )?;

        Ok(JsString::from(ixdtf).into())
    }

    /// 8.3.12 `Temporal.Instant.prototype.toLocaleString ( [ locales [ , options ] ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.instant.tolocalestring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Instant/toLocaleString
    fn to_locale_string(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // TODO: Update for ECMA-402 compliance
        let object = this.as_object();
        let instant = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ()
                    .with_message("the this object must be a Temporal.Instant object.")
            })?;

        let ixdtf = instant.inner.to_ixdtf_string_with_provider(
            None,
            ToStringRoundingOptions::default(),
            context.timezone_provider(),
        )?;
        Ok(JsString::from(ixdtf).into())
    }

    /// 8.3.13 `Temporal.Instant.prototype.toJSON ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.instant.tojson
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Instant/toJSON
    fn to_json(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let instant = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ()
                    .with_message("the this object must be a Temporal.Instant object.")
            })?;

        let ixdtf = instant.inner.to_ixdtf_string_with_provider(
            None,
            ToStringRoundingOptions::default(),
            context.timezone_provider(),
        )?;
        Ok(JsString::from(ixdtf).into())
    }

    /// 8.3.14 `Temporal.Instant.prototype.valueOf ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.instant.valueof
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Instant/valueOf
    fn value_of(_this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Err(JsNativeError::typ()
            .with_message("`valueOf` not supported by Temporal built-ins. See 'compare', 'equals', or `toString`")
            .into())
    }

    /// 8.3.15 `Temporal.Instant.prototype.toZonedDateTimeISO ( timeZone )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.instant.tozoneddatetimeiso
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Instant/toZonedDateTimeISO
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.Instant.html#method.to_zoned_date_time_iso
    pub(crate) fn to_zoned_date_time_iso(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let instant be the this value.
        // 2. Perform ? RequireInternalSlot(instant, [[InitializedTemporalInstant]]).
        let object = this.as_object();
        let instant = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ()
                    .with_message("the this object must be a Temporal.Instant object.")
            })?;

        // 3. Set timeZone to ? ToTemporalTimeZoneIdentifier(timeZone).
        let timezone = to_temporal_timezone_identifier(args.get_or_undefined(0), context)?;

        // 4. Return ! CreateTemporalZonedDateTime(instant.[[EpochNanoseconds]], timeZone, "iso8601").
        let zdt = instant
            .inner
            .to_zoned_date_time_iso_with_provider(timezone, context.timezone_provider())?;
        create_temporal_zoneddatetime(zdt, None, context).map(Into::into)
    }
}

// ==== Instant Abstract Operations ====

/// 8.5.2 `CreateTemporalInstant ( epochNanoseconds [ , newTarget ] )`
#[inline]
pub(crate) fn create_temporal_instant(
    instant: InnerInstant,
    new_target: Option<JsValue>,
    context: &mut Context,
) -> JsResult<JsValue> {
    // 1. Assert: ! IsValidEpochNanoseconds(epochNanoseconds) is true.
    // 2. If newTarget is not present, set newTarget to %Temporal.Instant%.
    let new_target = new_target.unwrap_or_else(|| {
        context
            .realm()
            .intrinsics()
            .constructors()
            .instant()
            .constructor()
            .into()
    });
    // 3. Let object be ? OrdinaryCreateFromConstructor(newTarget, "%Temporal.Instant.prototype%"), « [[InitializedTemporalInstant]], [[Nanoseconds]] »).
    let proto =
        get_prototype_from_constructor(&new_target, StandardConstructors::instant, context)?;

    // 4. Set object.[[Nanoseconds]] to epochNanoseconds.
    let obj = JsObject::from_proto_and_data(proto, Instant::new(instant));

    // 5. Return object.
    Ok(obj.into())
}

/// 8.5.3 `ToTemporalInstant ( item )`
#[inline]
fn to_temporal_instant(item: &JsValue, context: &mut Context) -> JsResult<InnerInstant> {
    // 1.If item is an Object, then
    let item = if let Some(obj) = item.as_object() {
        // a. If item has an [[InitializedTemporalInstant]] internal slot, then
        //     i. Return item.
        // b. If item has an [[InitializedTemporalZonedDateTime]] internal slot, then
        //     i. Return ! CreateTemporalInstant(item.[[Nanoseconds]]).
        // c. NOTE: This use of ToPrimitive allows Instant-like objects to be converted.
        // d. Set item to ? ToPrimitive(item, string).
        if let Some(instant) = obj.downcast_ref::<Instant>() {
            return Ok(*instant.inner);
        } else if let Some(zdt) = obj.downcast_ref::<ZonedDateTime>() {
            return Ok(zdt.inner.to_instant());
        }
        item.to_primitive(context, PreferredType::String)?
    } else {
        item.clone()
    };

    let Some(string_to_parse) = item.as_string() else {
        return Err(JsNativeError::typ()
            .with_message("Invalid type to convert to a Temporal.Instant.")
            .into());
    };

    // 3. Let parsed be ? ParseTemporalInstantString(item).
    // 4. If parsed.[[TimeZone]].[[Z]] is true, let offsetNanoseconds be 0; otherwise, let offsetNanoseconds be ! ParseDateTimeUTCOffset(parsed.[[TimeZone]].[[OffsetString]]).
    // 5. If abs(ISODateToEpochDays(parsed.[[Year]], parsed.[[Month]] - 1, parsed.[[Day]])) > 10**8, throw a RangeError exception.
    // 6. Let epochNanoseconds be GetUTCEpochNanoseconds(parsed.[[Year]], parsed.[[Month]], parsed.[[Day]], parsed.[[Hour]], parsed.[[Minute]], parsed.[[Second]], parsed.[[Millisecond]], parsed.[[Microsecond]], parsed.[[Nanosecond]], offsetNanoseconds).
    // 7. If IsValidEpochNanoseconds(epochNanoseconds) is false, throw a RangeError exception.
    // 8. Return ! CreateTemporalInstant(epochNanoseconds).
    // 2. If item is not a String, throw a TypeError exception.
    string_to_parse
        .to_std_string_escaped()
        .parse::<InnerInstant>()
        .map_err(Into::into)
}
