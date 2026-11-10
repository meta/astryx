//! Boa's implementation of the ECMAScript `Temporal.PlainMonthDay` built-in object.
use std::str::FromStr;

use crate::{
    Context, JsArgs, JsData, JsError, JsNativeError, JsObject, JsResult, JsString, JsSymbol,
    JsValue,
    builtins::{
        BuiltInBuilder, BuiltInConstructor, BuiltInObject, IntrinsicObject,
        options::{get_option, get_options_object},
        temporal::{calendar::get_temporal_calendar_slot_value_with_default, to_calendar_fields},
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
    Calendar, MonthCode, PlainMonthDay as InnerMonthDay,
    fields::CalendarFields,
    options::{DisplayCalendar, Overflow},
    parsed_intermediates::ParsedDate,
    partial::PartialDate,
};

use super::{DateTimeValues, create_temporal_date, is_partial_temporal_object};

/// The `Temporal.PlainMonthDay` built-in implementation
///
/// More information:
///
/// - [ECMAScript Temporal proposal][spec]
/// - [MDN reference][mdn]
/// - [`temporal_rs` documentation][temporal_rs-docs]
///
/// [spec]: https://tc39.es/proposal-temporal/#sec-temporal-plainmonthday-objects
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainMonthDay
/// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainMonthDay.html
#[derive(Debug, Clone, Trace, Finalize, JsData)]
#[boa_gc(unsafe_empty_trace)] // Safety: PlainMonthDay contains no traceable inner fields.
pub struct PlainMonthDay {
    pub(crate) inner: InnerMonthDay,
}

impl PlainMonthDay {
    fn new(inner: InnerMonthDay) -> Self {
        Self { inner }
    }
}

impl BuiltInObject for PlainMonthDay {
    const NAME: JsString = StaticJsStrings::PLAIN_MD_NAME;
}

impl IntrinsicObject for PlainMonthDay {
    fn init(realm: &Realm) {
        let get_day = BuiltInBuilder::callable(realm, Self::get_day)
            .name(js_string!("get day"))
            .build();

        let get_month_code = BuiltInBuilder::callable(realm, Self::get_month_code)
            .name(js_string!("get monthCode"))
            .build();

        let get_calendar_id = BuiltInBuilder::callable(realm, Self::get_calendar_id)
            .name(js_string!("get calendarId"))
            .build();

        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .property(
                JsSymbol::to_string_tag(),
                StaticJsStrings::PLAIN_MD_TAG,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("day"),
                Some(get_day),
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
                js_string!("calendarId"),
                Some(get_calendar_id),
                None,
                Attribute::CONFIGURABLE,
            )
            .static_method(Self::from, js_string!("from"), 1)
            .method(Self::with, js_string!("with"), 1)
            .method(Self::equals, js_string!("equals"), 1)
            .method(Self::to_string, js_string!("toString"), 0)
            .method(Self::to_locale_string, js_string!("toLocaleString"), 0)
            .method(Self::to_json, js_string!("toJSON"), 0)
            .method(Self::value_of, js_string!("valueOf"), 0)
            .method(Self::to_plain_date, js_string!("toPlainDate"), 1)
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInConstructor for PlainMonthDay {
    const CONSTRUCTOR_ARGUMENTS: usize = 2;
    const PROTOTYPE_STORAGE_SLOTS: usize = 14;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 1;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::plain_month_day;

    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is undefined, then
        if new_target.is_undefined() {
            // a. Throw a TypeError exception.
            return Err(JsNativeError::typ()
                .with_message("NewTarget cannot be undefined when constructing a PlainYearMonth.")
                .into());
        }

        // We can ignore 2 as the underlying temporal library handles the reference year
        let m = args
            .get_or_undefined(0)
            .to_finitef64(context)?
            .as_integer_with_truncation::<u8>();

        let d = args
            .get_or_undefined(1)
            .to_finitef64(context)?
            .as_integer_with_truncation::<u8>();

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

        let ref_year = args
            .get_or_undefined(3)
            .map(|v| {
                let finite = v.to_finitef64(context)?;
                Ok::<i32, JsError>(finite.as_integer_with_truncation::<i32>())
            })
            .transpose()?;

        let inner = InnerMonthDay::new_with_overflow(m, d, calendar, Overflow::Reject, ref_year)?;
        create_temporal_month_day(inner, Some(new_target), context)
    }
}

// ==== `Temporal.PlainMonthDay` static methods implementation ====

impl PlainMonthDay {
    /// 10.2.2 `Temporal.PlainMonthDay.from ( item [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plainmonthday.from
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainMonthDay/from
    fn from(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let item = args.get_or_undefined(0);
        let options = args.get_or_undefined(1);
        let inner = to_temporal_month_day(item, options, context)?;
        create_temporal_month_day(inner, None, context)
    }
}

// ==== `PlainMonthDay` Accessor Implementations ====

impl PlainMonthDay {
    // Helper for retrieving internal fields
    fn get_internal_field(this: &JsValue, field: &DateTimeValues) -> JsResult<JsValue> {
        let object = this.as_object();
        let month_day = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainMonthDay object.")
            })?;
        let inner = &month_day.inner;
        match field {
            DateTimeValues::Day => Ok(inner.day().into()),
            DateTimeValues::MonthCode => Ok(js_string!(inner.month_code().as_str()).into()),
            _ => unreachable!(),
        }
    }

    /// 10.3.3 get `Temporal.PlainMonthDay.prototype.calendarId`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plainmonthday.calendarid
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainMonthDay/calendarId
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainMonthDay.html#method.calendar
    fn get_calendar_id(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let month_day = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainMonthDay object.")
            })?;
        Ok(js_string!(month_day.inner.calendar().identifier()).into())
    }

    /// 10.3.4 get `Temporal.PlainMonthDay.prototype.day`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plainmonthday.day
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainMonthDay/day
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainMonthDay.html#method.day
    fn get_day(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Self::get_internal_field(this, &DateTimeValues::Day)
    }

    /// 10.3.5 get `Temporal.PlainMonthDay.prototype.monthCode`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-get-temporal.plainmonthday.monthcode
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainMonthDay/monthCode
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainMonthDay.html#method.month_code
    fn get_month_code(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Self::get_internal_field(this, &DateTimeValues::MonthCode)
    }
}

// ==== `Temporal.PlainMonthDay` Methods ====

impl PlainMonthDay {
    /// 10.3.6 `Temporal.PlainMonthDay.prototype.with ( temporalMonthDayLike [ , options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plainmonthday.with
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainMonthDay/with
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainMonthDay.html#method.with
    fn with(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let monthDay be the this value.
        // 2. Perform ? RequireInternalSlot(monthDay, [[InitializedTemporalMonthDay]]).
        let object = this.as_object();
        let month_day = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainMonthDay object.")
            })?;

        // 3. If ? IsPartialTemporalObject(temporalMonthDayLike) is false, throw a TypeError exception.
        let Some(object) = is_partial_temporal_object(args.get_or_undefined(0), context)? else {
            return Err(JsNativeError::typ()
                .with_message("temporalMonthDayLike was not a partial object")
                .into());
        };
        // 4. Let calendar be monthDay.[[Calendar]].
        // 5. Let fields be ISODateToFields(calendar, monthDay.[[ISODate]], month-day).
        // 6. Let partialMonthDay be ? PrepareCalendarFields(calendar, temporalMonthDayLike, « year, month, month-code, day », « », partial).
        let fields = to_calendar_fields(&object, month_day.inner.calendar(), context)?;
        // 7. Set fields to CalendarMergeFields(calendar, fields, partialMonthDay).
        // 8. Let resolvedOptions be ? GetOptionsObject(options).
        let resolved_options = get_options_object(args.get_or_undefined(1))?;
        // 9. Let overflow be ? GetTemporalOverflowOption(resolvedOptions).
        let overflow = get_option::<Overflow>(&resolved_options, js_string!("overflow"), context)?;
        // 10. Let isoDate be ? CalendarMonthDayFromFields(calendar, fields, overflow).
        // 11. Return ! CreateTemporalMonthDay(isoDate, calendar).
        create_temporal_month_day(month_day.inner.with(fields, overflow)?, None, context)
    }

    /// 10.3.7 `Temporal.PlainMonthDay.prototype.equals ( other )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plainmonthday.equals
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainMonthDay/equals
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainMonthDay.html#impl-PartialEq-for-PlainMonthDay
    fn equals(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let month_day = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainMonthDay object.")
            })?;

        let other =
            to_temporal_month_day(args.get_or_undefined(0), &JsValue::undefined(), context)?;

        Ok((month_day.inner == other).into())
    }

    /// 10.3.8 `Temporal.PlainMonthDay.prototype.toString ( [ options ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plainmonthday.tostring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainMonthDay/toString
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainMonthDay.html#method.to_ixdtf_string
    fn to_string(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let monthDay be the this value.
        // 2. Perform ? RequireInternalSlot(monthDay, [[InitializedTemporalMonthDay]]).
        let object = this.as_object();
        let month_day = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainMonthDay object.")
            })?;

        // 3. Set options to ? NormalizeOptionsObject(options).
        let options = get_options_object(args.get_or_undefined(0))?;
        // 4. Let showCalendar be ? ToShowCalendarOption(options).
        // Get calendarName from the options object
        let show_calendar =
            get_option::<DisplayCalendar>(&options, js_string!("calendarName"), context)?
                .unwrap_or(DisplayCalendar::Auto);

        let ixdtf = month_day.inner.to_ixdtf_string(show_calendar);
        Ok(JsString::from(ixdtf).into())
    }

    /// 10.3.9 `Temporal.PlainMonthDay.prototype.toLocaleString ( [ locales [ , options ] ] )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plainmonthday.tolocalestring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainMonthDay/toLocaleString
    pub(crate) fn to_locale_string(
        this: &JsValue,
        _: &[JsValue],
        _: &mut Context,
    ) -> JsResult<JsValue> {
        // TODO: Update for ECMA-402 compliance
        let object = this.as_object();
        let month_day = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainMonthDay object.")
            })?;

        Ok(JsString::from(month_day.inner.to_string()).into())
    }

    /// 10.3.10 `Temporal.PlainMonthDay.prototype.toJSON ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plainmonthday.tojson
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainMonthDay/toJSON
    pub(crate) fn to_json(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let object = this.as_object();
        let month_day = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainMonthDay object.")
            })?;

        Ok(JsString::from(month_day.inner.to_string()).into())
    }

    /// 9.3.11 `Temporal.PlainMonthDay.prototype.valueOf ( )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plainmonthday.valueof
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainMonthDay/valueOf
    pub(crate) fn value_of(_this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Err(JsNativeError::typ()
            .with_message("`valueOf` not supported by Temporal built-ins. See 'compare', 'equals', or `toString`")
            .into())
    }

    /// 10.3.12 `Temporal.PlainMonthDay.prototype.toPlainDate ( item )`
    ///
    /// More information:
    ///
    /// - [ECMAScript Temporal proposal][spec]
    /// - [MDN reference][mdn]
    /// - [`temporal_rs` documentation][temporal_rs-docs]
    ///
    /// [spec]: https://tc39.es/proposal-temporal/#sec-temporal.plainmonthday.toplaindate
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainMonthDay/toPlainDate
    /// [temporal_rs-docs]: https://docs.rs/temporal_rs/latest/temporal_rs/struct.PlainMonthDay.html#method.to_plain_date
    fn to_plain_date(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let monthDay be the this value.
        // 2. Perform ? RequireInternalSlot(monthDay, [[InitializedTemporalMonthDay]]).
        let object = this.as_object();
        let month_day = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message("this value must be a PlainMonthDay object.")
            })?;

        // 3. If item is not an Object, then
        let Some(item) = args.get_or_undefined(0).as_object() else {
            // a. Throw a TypeError exception.
            return Err(JsNativeError::typ()
                .with_message("toPlainDate item must be an object")
                .into());
        };

        // TODO: Handle and implement the below
        // 4. Let calendar be monthDay.[[Calendar]].
        // 5. Let fields be ISODateToFields(calendar, monthDay.[[ISODate]], month-day).
        // 6. Let inputFields be ? PrepareCalendarFields(calendar, item, « year », « », « »).
        let year = item
            .get(js_string!("year"), context)?
            .map(|v| {
                let finite = v.to_finitef64(context)?;
                Ok::<i32, JsError>(finite.as_integer_with_truncation::<i32>())
            })
            .transpose()?;

        let fields = CalendarFields::new().with_optional_year(year);

        // 7. Let mergedFields be CalendarMergeFields(calendar, fields, inputFields).
        // 8. Let isoDate be ? CalendarDateFromFields(calendar, mergedFields, constrain).
        // 9. Return ! CreateTemporalDate(isoDate, calendar).
        let result = month_day.inner.to_plain_date(Some(fields))?;
        create_temporal_date(result, None, context).map(Into::into)
    }
}

// ==== `PlainMonthDay` Abstract Operations ====

pub(crate) fn create_temporal_month_day(
    inner: InnerMonthDay,
    new_target: Option<&JsValue>,
    context: &mut Context,
) -> JsResult<JsValue> {
    // 1. If IsValidISODate(referenceISOYear, isoMonth, isoDay) is false, throw a RangeError exception.
    // 2. If ISODateTimeWithinLimits(referenceISOYear, isoMonth, isoDay, 12, 0, 0, 0, 0, 0) is false, throw a RangeError exception.

    // 3. If newTarget is not present, set newTarget to %Temporal.PlainMonthDay%.
    let new_target = if let Some(target) = new_target {
        target.clone()
    } else {
        context
            .realm()
            .intrinsics()
            .constructors()
            .plain_month_day()
            .constructor()
            .into()
    };

    // 4. Let object be ? OrdinaryCreateFromConstructor(newTarget, "%Temporal.PlainMonthDay.prototype%", « [[InitializedTemporalMonthDay]], [[ISOMonth]], [[ISODay]], [[ISOYear]], [[Calendar]] »).
    let proto = get_prototype_from_constructor(
        &new_target,
        StandardConstructors::plain_month_day,
        context,
    )?;

    // 5. Set object.[[ISOMonth]] to isoMonth.
    // 6. Set object.[[ISODay]] to isoDay.
    // 7. Set object.[[Calendar]] to calendar.
    // 8. Set object.[[ISOYear]] to referenceISOYear.
    let obj = JsObject::from_proto_and_data(proto, PlainMonthDay::new(inner));

    // 9. Return object.
    Ok(obj.into())
}

fn to_temporal_month_day(
    item: &JsValue,
    options: &JsValue,
    context: &mut Context,
) -> JsResult<InnerMonthDay> {
    // NOTE: One should be guaranteed by caller
    // 1. If options is not present, set options to undefined.
    // 2. If item is a Object, then
    if let Some(obj) = item.as_object() {
        // a. If item has an [[InitializedTemporalMonthDay]] internal slot, then
        if let Some(md) = obj.downcast_ref::<PlainMonthDay>() {
            // i. Let resolvedOptions be ? GetOptionsObject(options).
            let options = get_options_object(options)?;
            // ii. Perform ? GetTemporalOverflowOption(resolvedOptions).
            let _ = get_option::<Overflow>(&options, js_string!("overflow"), context)?;
            // iii. Return ! CreateTemporalMonthDay(item.[[ISODate]], item.[[Calendar]]).
            return Ok(md.inner.clone());
        }

        // b. Let calendar be ? GetTemporalCalendarIdentifierWithISODefault(item).
        let calendar = get_temporal_calendar_slot_value_with_default(&obj, context)?;
        // NOTE: inlined
        // c. Let fields be ? PrepareCalendarFields(calendar, item, « year, month, month-code, day », «», «»).
        let day = obj
            .get(js_string!("day"), context)?
            .map(|v| {
                let finite = v.to_finitef64(context)?;
                finite
                    .as_positive_integer_with_truncation::<u8>()
                    .map_err(JsError::from)
            })
            .transpose()?;

        let month = obj
            .get(js_string!("month"), context)?
            .map(|v| {
                let finite = v.to_finitef64(context)?;
                finite
                    .as_positive_integer_with_truncation::<u8>()
                    .map_err(JsError::from)
            })
            .transpose()?;

        let month_code = obj
            .get(js_string!("monthCode"), context)?
            .map(|v| {
                let primitive = v.to_primitive(context, crate::value::PreferredType::String)?;
                let Some(month_code) = primitive.as_string() else {
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

        let partial_date = PartialDate::new()
            .with_month(month)
            .with_day(day)
            .with_year(year)
            .with_month_code(month_code)
            .with_calendar(calendar);

        // d. Let resolvedOptions be ? GetOptionsObject(options).
        let options = get_options_object(options)?;
        // e. Let overflow be ? GetTemporalOverflowOption(resolvedOptions).
        let overflow = get_option::<Overflow>(&options, js_string!("overflow"), context)?;
        // f. Let isoDate be ? CalendarMonthDayFromFields(calendar, fields, overflow).
        // g. Return ! CreateTemporalMonthDay(isoDate, calendar).
        return Ok(InnerMonthDay::from_partial(partial_date, overflow)?);
    }

    // 3. If item is not a String, throw a TypeError exception.
    let Some(md_string) = item.as_string() else {
        return Err(JsNativeError::typ()
            .with_message("item must be an object or a string")
            .into());
    };
    // 4. Let result be ? ParseISODateTime(item, « TemporalMonthDayString »).
    // 5. Let calendar be result.[[Calendar]].
    // 6. If calendar is empty, set calendar to "iso8601".
    // 7. Set calendar to ? CanonicalizeCalendar(calendar).
    let parse_record =
        ParsedDate::month_day_from_utf8(md_string.to_std_string_escaped().as_bytes())?;
    // 8. Let resolvedOptions be ? GetOptionsObject(options).
    let options = get_options_object(options)?;
    // 9. Perform ? GetTemporalOverflowOption(resolvedOptions).
    let _ = get_option::<Overflow>(&options, js_string!("overflow"), context)?;
    // 10. If calendar is "iso8601", then
    // a. Let referenceISOYear be 1972 (the first ISO 8601 leap year after the epoch).
    // b. Let isoDate be CreateISODateRecord(referenceISOYear, result.[[Month]], result.[[Day]]).
    // c. Return ! CreateTemporalMonthDay(isoDate, calendar).
    // 11. Let isoDate be CreateISODateRecord(result.[[Year]], result.[[Month]], result.[[Day]]).
    // 12. If ISODateWithinLimits(isoDate) is false, throw a RangeError exception.
    // 13. Set result to ISODateToFields(calendar, isoDate, month-day).
    // 14. NOTE: The following operation is called with constrain regardless of the value of overflow, in order for the calendar to store a canonical value in the [[Year]] field of the [[ISODate]] internal slot of the result.
    // 15. Set isoDate to ? CalendarMonthDayFromFields(calendar, result, constrain).
    // 16. Return ! CreateTemporalMonthDay(isoDate, calendar).
    Ok(InnerMonthDay::from_parsed(parse_record)?)
}
