//! An implementation of the `Temporal` proposal's Calendar builtin.

use std::str::FromStr;

use super::extract_from_temporal_type;
use crate::{Context, JsNativeError, JsObject, JsResult, JsValue, js_string};
use temporal_rs::Calendar;

// -- `Calendar` Abstract Operations --

/// 12.2.9 `GetTemporalCalendarSlotValueWithISODefault ( item )`
#[allow(unused)]
pub(crate) fn get_temporal_calendar_slot_value_with_default(
    item: &JsObject,
    context: &mut Context,
) -> JsResult<Calendar> {
    // 1. If item has an [[InitializedTemporalDate]], [[InitializedTemporalDateTime]], [[InitializedTemporalMonthDay]],
    // [[InitializedTemporalYearMonth]], or [[InitializedTemporalZonedDateTime]] internal slot, then
    if let Some(calendar) = extract_from_temporal_type(
        item,
        |d| Ok(Some(d.inner.calendar().clone())),
        |dt| Ok(Some(dt.inner.calendar().clone())),
        |ym| Ok(Some(ym.inner.calendar().clone())),
        |md| Ok(Some(md.inner.calendar().clone())),
        |zdt| Ok(Some(zdt.inner.calendar().clone())),
    )? {
        // a. Return item.[[Calendar]].
        return Ok(calendar);
    }

    // 2. Let calendarLike be ? Get(item, "calendar").
    let calendar_like = item.get(js_string!("calendar"), context)?;
    // 3. If calendarLike is undefined, then
    if calendar_like.is_undefined() {
        // a. Return "iso8601".
        return Ok(Calendar::ISO);
    }
    // 4. Return ? ToTemporalCalendarIdentifier(calendarLike).
    to_temporal_calendar_identifier(&calendar_like)
}

/// `12.2.8 ToTemporalCalendarIdentifier ( temporalCalendarLike )`
pub(crate) fn to_temporal_calendar_identifier(calendar_like: &JsValue) -> JsResult<Calendar> {
    // 1. If temporalCalendarLike is an Object, then
    if let Some(calendar_like) = calendar_like.as_object() {
        // a. If temporalCalendarLike has an [[InitializedTemporalDate]], [[InitializedTemporalDateTime]],
        // [[InitializedTemporalMonthDay]], [[InitializedTemporalYearMonth]], or [[InitializedTemporalZonedDateTime]] internal slot, then
        if let Some(calendar) = extract_from_temporal_type(
            &calendar_like,
            |d| Ok(Some(d.inner.calendar().clone())),
            |dt| Ok(Some(dt.inner.calendar().clone())),
            |ym| Ok(Some(ym.inner.calendar().clone())),
            |md| Ok(Some(md.inner.calendar().clone())),
            |zdt| Ok(Some(zdt.inner.calendar().clone())),
        )? {
            // i. Return temporalCalendarLike.[[Calendar]].
            return Ok(calendar);
        }
    }

    // 2. If temporalCalendarLike is not a String, throw a TypeError exception.
    let Some(calendar_id) = calendar_like.as_string() else {
        return Err(JsNativeError::typ()
            .with_message("temporalCalendarLike is not a string.")
            .into());
    };
    // 3. Let identifier be ? ParseTemporalCalendarString(temporalCalendarLike).
    // 4. Return ? CanonicalizeCalendar(identifier).
    Ok(Calendar::from_str(&calendar_id.to_std_string_escaped())?)
}
