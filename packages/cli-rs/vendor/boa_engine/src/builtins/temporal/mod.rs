//! The ECMAScript `Temporal` stage 3 built-in implementation.
//!
//! Boa's Temporal implementation uses the `temporal_rs` crate
//! for the core functionality of the implementation.
//!
//! More information:
//!
//! [spec]: https://tc39.es/proposal-temporal/

mod calendar;
mod duration;
mod error;
mod instant;
mod now;
mod options;
mod plain_date;
mod plain_date_time;
mod plain_month_day;
mod plain_time;
mod plain_year_month;
mod zoneddatetime;

#[cfg(test)]
mod tests;

pub use self::{
    duration::*, instant::*, now::*, plain_date::*, plain_date_time::*, plain_month_day::*,
    plain_time::*, plain_year_month::*, zoneddatetime::*,
};

use crate::{
    Context, JsNativeError, JsObject, JsResult, JsString, JsSymbol, JsValue,
    builtins::{
        BuiltInBuilder, BuiltInObject, IntrinsicObject,
        temporal::calendar::get_temporal_calendar_slot_value_with_default,
    },
    context::intrinsics::Intrinsics,
    js_string,
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
};
use temporal_rs::{
    PlainDate as TemporalDate, ZonedDateTime as TemporalZonedDateTime,
    partial::PartialZonedDateTime, primitive::FiniteF64,
};
use temporal_rs::{options::RelativeTo, partial::PartialDate};

// An enum representing common fields across `Temporal` objects.
pub(crate) enum DateTimeValues {
    Year,
    Month,
    MonthCode,
    Week,
    Day,
    Hour,
    Minute,
    Second,
    Millisecond,
    Microsecond,
    Nanosecond,
}

/// `Temporal` built-in implementation
///
/// The Temporal implementation in Boa uses `temporal_rs` for the
/// core implementation.
///
/// More information:
///  - [ECMAScript Temporal proposal][spec]
///  - [MDN Reference][mdn]
///  - [`temporal_rs` docs][temporal_rs-docs]
///
/// [spec]: https://tc39.es/proposal-temporal/#sec-temporal-objects
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal
/// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct Temporal;

impl BuiltInObject for Temporal {
    const NAME: JsString = StaticJsStrings::TEMPORAL;
}

impl IntrinsicObject for Temporal {
    fn init(realm: &Realm) {
        BuiltInBuilder::with_intrinsic::<Self>(realm)
            .static_property(
                JsSymbol::to_string_tag(),
                Self::NAME,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .static_property(
                js_string!("Now"),
                realm.intrinsics().objects().now(),
                Attribute::WRITABLE | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .static_property(
                js_string!("Duration"),
                realm.intrinsics().constructors().duration().constructor(),
                Attribute::WRITABLE | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .static_property(
                js_string!("Instant"),
                realm.intrinsics().constructors().instant().constructor(),
                Attribute::WRITABLE | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .static_property(
                js_string!("PlainDate"),
                realm.intrinsics().constructors().plain_date().constructor(),
                Attribute::WRITABLE | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .static_property(
                js_string!("PlainDateTime"),
                realm
                    .intrinsics()
                    .constructors()
                    .plain_date_time()
                    .constructor(),
                Attribute::WRITABLE | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .static_property(
                js_string!("PlainMonthDay"),
                realm
                    .intrinsics()
                    .constructors()
                    .plain_month_day()
                    .constructor(),
                Attribute::WRITABLE | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .static_property(
                js_string!("PlainTime"),
                realm.intrinsics().constructors().plain_time().constructor(),
                Attribute::WRITABLE | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .static_property(
                js_string!("PlainYearMonth"),
                realm
                    .intrinsics()
                    .constructors()
                    .plain_year_month()
                    .constructor(),
                Attribute::WRITABLE | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .static_property(
                js_string!("ZonedDateTime"),
                realm
                    .intrinsics()
                    .constructors()
                    .zoned_date_time()
                    .constructor(),
                Attribute::WRITABLE | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        intrinsics.objects().temporal()
    }
}

// -- Temporal Abstract Operations --

pub(crate) fn get_relative_to_option(
    options: &JsObject,
    context: &mut Context,
) -> JsResult<Option<RelativeTo>> {
    // Let value be ? Get(options, "relativeTo").
    let value = options.get(js_string!("relativeTo"), context)?;
    // 2. If value is undefined, return the Record { [[PlainRelativeTo]]: undefined, [[ZonedRelativeTo]]: undefined }.
    if value.is_undefined() {
        return Ok(None);
    }
    // 3. Let offsetBehaviour be option.
    // 4. Let matchBehaviour be match-exactly.
    // 5. If value is an Object, then
    if let Some(object) = value.as_object() {
        // a. If value has an [[InitializedTemporalZonedDateTime]] internal slot, then
        if let Some(zdt) = object.downcast_ref::<ZonedDateTime>() {
            // i. Return the Record { [[PlainRelativeTo]]: undefined, [[ZonedRelativeTo]]: value }.
            return Ok(Some(RelativeTo::ZonedDateTime(zdt.inner.as_ref().clone())));
        // b. If value has an [[InitializedTemporalDate]] internal slot, then
        } else if let Some(date) = object.downcast_ref::<PlainDate>() {
            // i. Return the Record { [[PlainRelativeTo]]: value, [[ZonedRelativeTo]]: undefined }.
            return Ok(Some(RelativeTo::PlainDate(date.inner.clone())));
        // c. If value has an [[InitializedTemporalDateTime]] internal slot, then
        } else if let Some(dt) = object.downcast_ref::<PlainDateTime>() {
            // i. Let plainDate be ! CreateTemporalDate(value.[[ISODateTime]].[[ISODate]], value.[[Calendar]]).
            // ii. Return the Record { [[PlainRelativeTo]]: plainDate, [[ZonedRelativeTo]]: undefined }.
            return Ok(Some(RelativeTo::PlainDate(dt.inner.clone().into())));
        }
        // d. Let calendar be ? GetTemporalCalendarIdentifierWithISODefault(value).
        let calendar = get_temporal_calendar_slot_value_with_default(&object, context)?;
        // TODO: Check behavior around Partial here.
        // e. Let fields be ? PrepareCalendarFields(calendar, value, « year, month, month-code, day », « hour, minute, second, millisecond, microsecond, nanosecond, offset, time-zone », «»).
        let (fields, timezone) = to_zoned_date_time_fields(
            &object,
            &calendar,
            ZdtFieldsType::TimeZoneNotRequired,
            context,
        )?;
        // f. Let result be ? InterpretTemporalDateTimeFields(calendar, fields, constrain).
        // g. Let timeZone be fields.[[TimeZone]].
        // h. Let offsetString be fields.[[OffsetString]].
        // i. If offsetString is unset, then
        // i. Set offsetBehaviour to wall.
        // j. Let isoDate be result.[[ISODate]].
        // TODO: Update in temporal_rs
        if timezone.is_none() {
            return Ok(Some(RelativeTo::PlainDate(TemporalDate::from_partial(
                PartialDate {
                    calendar_fields: fields.calendar_fields,
                    calendar,
                },
                None,
            )?)));
        }
        // k. Let time be result.[[Time]].
        let zdt = TemporalZonedDateTime::from_partial_with_provider(
            PartialZonedDateTime {
                fields,
                timezone,
                calendar,
            },
            None,
            None,
            None,
            context.timezone_provider(),
        )?;
        return Ok(Some(RelativeTo::ZonedDateTime(zdt)));
    }
    // 6. Else,
    // a. If value is not a String, throw a TypeError exception.
    let Some(relative_to_str) = value.as_string() else {
        return Err(JsNativeError::typ()
            .with_message("relativeTo must be an object or string.")
            .into());
    };
    // Steps 7-12 are handled by temporal_rs
    Ok(Some(RelativeTo::try_from_str_with_provider(
        &relative_to_str.to_std_string_escaped(),
        context.timezone_provider(),
    )?))
}

// 13.26 IsPartialTemporalObject ( object )
pub(crate) fn is_partial_temporal_object(
    value: &JsValue,
    context: &mut Context,
) -> JsResult<Option<JsObject>> {
    // 1. If value is not an Object, return false.
    let Some(obj) = value.as_object() else {
        return Ok(None);
    };

    // 2. If value has an [[InitializedTemporalDate]], [[InitializedTemporalDateTime]],
    // [[InitializedTemporalMonthDay]], [[InitializedTemporalTime]],
    // [[InitializedTemporalYearMonth]], or
    // [[InitializedTemporalZonedDateTime]] internal slot, return false.
    if obj.is::<PlainDate>()
        || obj.is::<PlainDateTime>()
        || obj.is::<PlainMonthDay>()
        || obj.is::<PlainYearMonth>()
        || obj.is::<PlainTime>()
        || obj.is::<ZonedDateTime>()
    {
        return Ok(None);
    }

    // 3. Let calendarProperty be ? Get(value, "calendar").
    let calendar_property = obj.get(js_string!("calendar"), context)?;
    // 4. If calendarProperty is not undefined, return false.
    if !calendar_property.is_undefined() {
        return Ok(None);
    }
    // 5. Let timeZoneProperty be ? Get(value, "timeZone").
    let time_zone_property = obj.get(js_string!("timeZone"), context)?;
    // 6. If timeZoneProperty is not undefined, return false.
    if !time_zone_property.is_undefined() {
        return Ok(None);
    }
    // 7. Return true.
    Ok(Some(obj))
}

impl JsValue {
    pub(crate) fn to_finitef64(&self, context: &mut Context) -> JsResult<FiniteF64> {
        let number = self.to_number(context)?;
        let result = FiniteF64::try_from(number)?;
        Ok(result)
    }
}

fn extract_from_temporal_type<DF, DTF, YMF, MDF, ZDTF, Ret>(
    object: &JsObject,
    date_f: DF,
    datetime_f: DTF,
    year_month_f: YMF,
    month_day_f: MDF,
    zoned_datetime_f: ZDTF,
) -> JsResult<Option<Ret>>
where
    DF: FnOnce(&PlainDate) -> JsResult<Option<Ret>>,
    DTF: FnOnce(&PlainDateTime) -> JsResult<Option<Ret>>,
    YMF: FnOnce(&PlainYearMonth) -> JsResult<Option<Ret>>,
    MDF: FnOnce(&PlainMonthDay) -> JsResult<Option<Ret>>,
    ZDTF: FnOnce(&ZonedDateTime) -> JsResult<Option<Ret>>,
{
    if let Some(date) = object.downcast_ref::<PlainDate>() {
        return date_f(&date);
    } else if let Some(dt) = object.downcast_ref::<PlainDateTime>() {
        return datetime_f(&dt);
    } else if let Some(ym) = object.downcast_ref::<PlainYearMonth>() {
        return year_month_f(&ym);
    } else if let Some(md) = object.downcast_ref::<PlainMonthDay>() {
        return month_day_f(&md);
    } else if let Some(dt) = object.downcast_ref::<ZonedDateTime>() {
        return zoned_datetime_f(&dt);
    }

    Ok(None)
}
