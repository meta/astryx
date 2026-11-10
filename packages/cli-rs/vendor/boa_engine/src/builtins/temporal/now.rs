//! Boa's implementation of `Temporal.Now` ECMAScript global namespace object.

use crate::{
    Context, JsArgs, JsObject, JsResult, JsString, JsSymbol, JsValue,
    builtins::{BuiltInBuilder, BuiltInObject, IntrinsicObject},
    context::intrinsics::Intrinsics,
    js_string,
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
};
use temporal_rs::{
    TemporalResult, TimeZone,
    host::{HostClock, HostHooks, HostTimeZone},
    now::Now as InnerNow,
    provider::TimeZoneProvider,
    unix_time::EpochNanoseconds,
};

#[cfg(feature = "system-time-zone")]
use temporal_rs::TemporalError;

use super::{
    create_temporal_date, create_temporal_datetime, create_temporal_instant, create_temporal_time,
    create_temporal_zoneddatetime, to_temporal_timezone_identifier,
};

/// The `Temporal.Now` global namespace object
///
/// More information:
///
/// - [ECMAScript Temporal proposal][spec]
/// - [MDN reference][mdn]
///
/// [spec]: https://tc39.es/proposal-temporal/#sec-temporal-now-object
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Now
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Now;

impl IntrinsicObject for Now {
    /// Initializes the `Temporal.Now` object.
    fn init(realm: &Realm) {
        // is an ordinary object.
        // has a [[Prototype]] internal slot whose value is %Object.prototype%.
        // is not a function object.
        // does not have a [[Construct]] internal method; it cannot be used as a constructor with the new operator.
        // does not have a [[Call]] internal method; it cannot be invoked as a function.
        BuiltInBuilder::with_intrinsic::<Self>(realm)
            .static_property(
                JsSymbol::to_string_tag(),
                StaticJsStrings::NOW_TAG,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .static_method(Self::time_zone_id, js_string!("timeZoneId"), 0)
            .static_method(Self::instant, js_string!("instant"), 0)
            .static_method(Self::plain_date_time_iso, js_string!("plainDateTimeISO"), 0)
            .static_method(Self::zoned_date_time_iso, js_string!("zonedDateTimeISO"), 0)
            .static_method(Self::plain_date_iso, js_string!("plainDateISO"), 0)
            .static_method(Self::plain_time_iso, js_string!("plainTimeISO"), 0)
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        intrinsics.objects().now()
    }
}

impl BuiltInObject for Now {
    const NAME: JsString = StaticJsStrings::NOW_NAME;
}

impl Now {
    /// 2.2.1 `Temporal.Now.timeZoneId ( )`
    ///
    /// Returns the currently active system time zone identifier.
    ///
    /// More information:
    ///  - [ECMAScript specification][spec]
    ///  - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.now.timezone
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Now/timeZoneId
    fn time_zone_id(_: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // TODO: this should be optimized once system time zone is in context
        // 1. Return ! SystemTimeZone().
        let context: &Context = context;
        let time_zone = context.get_system_time_zone(context.timezone_provider())?;
        Ok(JsString::from(time_zone.identifier_with_provider(context.timezone_provider())?).into())
    }

    /// 2.2.2 `Temporal.Now.instant()`
    ///
    /// Returns the current time as an `Temporal.Instant`.
    ///
    /// More information:
    ///  - [ECMAscript specification][spec]
    ///  - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.now.instant
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Now/instant
    fn instant(_: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let now: InnerNow<&Context> = InnerNow::new(context);
        let instant = now.instant()?;
        create_temporal_instant(instant, None, context)
    }

    /// 2.2.3 `Temporal.Now.plainDateTimeISO ( [ temporalTimeZoneLike ] )`
    ///
    /// Returns the current date and time as a `Temporal.PlainDateTime` with an ISO8601 calendar.
    ///
    /// Takes an optional time zone, which defaults to the system time zone if undefined.
    ///
    /// More information:
    ///  - [ECMAscript specification][spec]
    ///  - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.now.plaindatetimeiso
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Now/plainDateTimeISO
    fn plain_date_time_iso(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let time_zone = args
            .get_or_undefined(0)
            .map(|v| to_temporal_timezone_identifier(v, context))
            .transpose()?;

        let now: InnerNow<&Context> = InnerNow::new(context);

        let datetime =
            now.plain_date_time_iso_with_provider(time_zone, context.timezone_provider())?;
        create_temporal_datetime(datetime, None, context).map(Into::into)
    }

    /// 2.2.4 `Temporal.Now.zonedDateTimeISO ( [ temporalTimeZoneLike ] )`
    ///
    /// Returns the current date and time as a `Temporal.ZonedDateTime` with an ISO8601 calendar.
    ///
    /// Takes an optional time zone, which defaults to the system time zone if undefined.
    ///
    /// More information:
    ///  - [ECMAscript specification][spec]
    ///  - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.now.zoneddatetimeiso
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Now/zonedDateTimeISO
    fn zoned_date_time_iso(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let time_zone = args
            .get_or_undefined(0)
            .map(|v| to_temporal_timezone_identifier(v, context))
            .transpose()?;

        let now: InnerNow<&Context> = InnerNow::new(context);
        let zdt = now.zoned_date_time_iso_with_provider(time_zone, context.timezone_provider())?;
        create_temporal_zoneddatetime(zdt, None, context).map(Into::into)
    }

    /// 2.2.5 `Temporal.Now.plainDateISO ( [ temporalTimeZoneLike ] )`
    ///
    /// Returns the current date as a `Temporal.PlainDate` with an ISO8601 calendar.
    ///
    /// Takes an optional time zone, which defaults to the system time zone if undefined.
    ///
    /// More information:
    ///  - [ECMAscript specification][spec]
    ///  - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.now.plaindateiso
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Now/plainDateISO
    fn plain_date_iso(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let time_zone = args
            .get_or_undefined(0)
            .map(|v| to_temporal_timezone_identifier(v, context))
            .transpose()?;

        let now: InnerNow<&Context> = InnerNow::new(context);

        let pd = now.plain_date_iso_with_provider(time_zone, context.timezone_provider())?;
        create_temporal_date(pd, None, context).map(Into::into)
    }

    /// 2.2.6 `Temporal.Now.plainTimeISO ( [ temporalTimeZoneLike ] )`
    ///
    /// Returns the current time as a `Temporal.PlainTime` with an ISO8601 calendar.
    ///
    /// Takes an optional time zone, which defaults to the system time zone if undefined.
    ///
    /// More information:
    ///  - [ECMAscript specification][spec]
    ///  - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.now.plaintimeiso
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Now/plainTimeISO
    fn plain_time_iso(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let time_zone = args
            .get_or_undefined(0)
            .map(|v| to_temporal_timezone_identifier(v, context))
            .transpose()?;

        let now: InnerNow<&Context> = InnerNow::new(context);

        let pt = now.plain_time_iso_with_provider(time_zone, context.timezone_provider())?;
        create_temporal_time(pt, None, context).map(Into::into)
    }
}

impl HostHooks for &Context {}

impl HostClock for &Context {
    fn get_host_epoch_nanoseconds(&self) -> TemporalResult<EpochNanoseconds> {
        // Temporal needs actual Unix epoch time, not monotonic time
        let millis = self.clock().system_time_millis();
        let nanos = i128::from(millis) * 1_000_000;
        Ok(EpochNanoseconds::from(nanos))
    }
}

impl HostTimeZone for &Context {
    fn get_host_time_zone(
        &self,
        provider: &(impl TimeZoneProvider + ?Sized),
    ) -> TemporalResult<TimeZone> {
        #[cfg(not(feature = "system-time-zone"))]
        {
            Ok(TimeZone::utc_with_provider(provider))
        }
        #[cfg(feature = "system-time-zone")]
        {
            iana_time_zone::get_timezone()
                .map_err(|_| {
                    TemporalError::range().with_message("Unable to fetch system time zone")
                })
                .and_then(|id| TimeZone::try_from_str_with_provider(&id, provider))
        }
    }
}
