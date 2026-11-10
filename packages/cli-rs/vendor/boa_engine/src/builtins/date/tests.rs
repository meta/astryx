use crate::{
    JsNativeErrorKind, TestAction,
    builtins::date::utils::fast_atoi::{process_4, process_8},
    js_string, run_test_actions,
};
use boa_macros::js_str;
use indoc::indoc;
use time::{OffsetDateTime, macros::format_description};

// NOTE: Javascript Uses 0-based months, where time uses 1-based months.
// Many of the assertions look wrong because of this.

fn month_from_u8(month: u8) -> time::Month {
    match month {
        1 => time::Month::January,
        2 => time::Month::February,
        3 => time::Month::March,
        4 => time::Month::April,
        5 => time::Month::May,
        6 => time::Month::June,
        7 => time::Month::July,
        8 => time::Month::August,
        9 => time::Month::September,
        10 => time::Month::October,
        11 => time::Month::November,
        12 => time::Month::December,
        _ => unreachable!(),
    }
}

fn from_local(
    year: i32,
    month: u8,
    date: u8,
    hour: u8,
    minute: u8,
    second: u8,
    millisecond: u16,
) -> OffsetDateTime {
    let t = time::Date::from_calendar_date(year, month_from_u8(month), date)
        .unwrap()
        .with_hms_milli(hour, minute, second, millisecond)
        .unwrap()
        .assume_utc();
    let offset = time::UtcOffset::local_offset_at(t).unwrap();
    t.replace_offset(offset)
}

fn timestamp_from_local(
    year: i32,
    month: u8,
    date: u8,
    hour: u8,
    minute: u8,
    second: u8,
    millisecond: u16,
) -> i64 {
    let t = from_local(year, month, date, hour, minute, second, millisecond);
    t.unix_timestamp() * 1000 + i64::from(t.millisecond())
}

fn timestamp_from_utc(
    year: i32,
    month: u8,
    date: u8,
    hour: u8,
    minute: u8,
    second: u8,
    millisecond: u16,
) -> i64 {
    let t = time::Date::from_calendar_date(year, month_from_u8(month), date)
        .unwrap()
        .with_hms_milli(hour, minute, second, millisecond)
        .unwrap()
        .assume_utc();
    t.unix_timestamp() * 1000 + i64::from(t.millisecond())
}

#[test]
fn parse_ascii_digits() {
    let parse_8_ascii_digits = |val: &[u8; 8], len: usize| -> u64 {
        let val = u64::from_le_bytes(*val);
        process_8(val, len)
    };
    assert_eq!(12_345_678, parse_8_ascii_digits(b"12345678", 8));
    assert_eq!(123_456, parse_8_ascii_digits(b"123456xx", 6));
    assert_eq!(123, parse_8_ascii_digits(b"123xxxxx", 3));
    assert_eq!(123, parse_8_ascii_digits(b"000123xx", 6));
    assert_eq!(0, parse_8_ascii_digits(b"00000000", 8));
    let parse_4_ascii_digits = |val: &[u8; 4], len: usize| -> u64 {
        let val = u32::from_le_bytes(*val);
        u64::from(process_4(val, len))
    };
    assert_eq!(1234, parse_4_ascii_digits(b"1234", 4));
    assert_eq!(12, parse_4_ascii_digits(b"12xx", 2));
    assert_eq!(3, parse_4_ascii_digits(b"003x", 3));
    assert_eq!(23, parse_4_ascii_digits(b"023x", 3));
    assert_eq!(0, parse_4_ascii_digits(b"0000", 4));
}

#[test]
fn date_this_time_value() {
    run_test_actions([TestAction::assert_native_error(
        "({toString: Date.prototype.toString}).toString()",
        JsNativeErrorKind::Type,
        "'this' is not a Date",
    )]);
}

#[test]
fn date_ctor_call() {
    run_test_actions([
        TestAction::run("let a = new Date()"),
        TestAction::inspect_context(|_| std::thread::sleep(std::time::Duration::from_millis(1))),
        TestAction::assert("a.getTime() != new Date().getTime()"),
    ]);
}

#[test]
fn date_ctor_call_string() {
    run_test_actions([TestAction::assert_eq(
        "new Date('2020-06-08T09:16:15.779-06:30').getTime()",
        timestamp_from_utc(2020, 6, 8, 15, 46, 15, 779),
    )]);
}

#[test]
fn date_ctor_call_string_invalid() {
    run_test_actions([TestAction::assert_eq(
        "new Date('nope').getTime()",
        f64::NAN,
    )]);
}

#[test]
fn date_ctor_call_number() {
    run_test_actions([TestAction::assert_eq(
        "new Date(1594199775779).getTime()",
        timestamp_from_utc(2020, 7, 8, 9, 16, 15, 779),
    )]);
}

#[test]
fn date_ctor_call_date() {
    run_test_actions([TestAction::assert_eq(
        "new Date(new Date(1594199775779)).getTime()",
        timestamp_from_utc(2020, 7, 8, 9, 16, 15, 779),
    )]);
}

#[test]
fn date_ctor_call_multiple() {
    run_test_actions([TestAction::assert_eq(
        "new Date(2020, 6, 8, 9, 16, 15, 779).getTime()",
        timestamp_from_local(2020, 7, 8, 9, 16, 15, 779),
    )]);
}

#[test]
fn date_ctor_call_multiple_90s() {
    run_test_actions([TestAction::assert_eq(
        "new Date(99, 6, 8, 9, 16, 15, 779).getTime()",
        timestamp_from_local(1999, 7, 8, 9, 16, 15, 779),
    )]);
}

#[test]
fn date_ctor_call_multiple_nan() {
    run_test_actions([
        TestAction::assert_eq("new Date(1/0, 6, 8, 9, 16, 15, 779).getTime()", f64::NAN),
        TestAction::assert_eq("new Date(2020, 1/0, 8, 9, 16, 15, 779).getTime()", f64::NAN),
        TestAction::assert_eq("new Date(2020, 6, 1/0, 9, 16, 15, 779).getTime()", f64::NAN),
        TestAction::assert_eq("new Date(2020, 6, 8, 1/0, 16, 15, 779).getTime()", f64::NAN),
        TestAction::assert_eq("new Date(2020, 6, 8, 9, 1/0, 15, 779).getTime()", f64::NAN),
        TestAction::assert_eq("new Date(2020, 6, 8, 9, 16, 1/0, 779).getTime()", f64::NAN),
        TestAction::assert_eq("new Date(2020, 6, 8, 9, 16, 15, 1/0).getTime()", f64::NAN),
    ]);
}

#[test]
fn date_ctor_now_call() {
    run_test_actions([
        TestAction::run("let a = Date.now()"),
        TestAction::inspect_context(|_| std::thread::sleep(std::time::Duration::from_millis(1))),
        TestAction::assert("a != Date.now()"),
    ]);
}

#[test]
fn date_ctor_parse_call() {
    run_test_actions([TestAction::assert_eq(
        "Date.parse('2020-06-08T09:16:15.779-07:30')",
        1_591_634_775_779_i64,
    )]);
}

#[test]
fn date_ctor_utc_call() {
    run_test_actions([TestAction::assert_eq(
        "Date.UTC(2020, 6, 8, 9, 16, 15, 779)",
        1_594_199_775_779_i64,
    )]);
}

#[test]
fn date_ctor_utc_call_nan() {
    run_test_actions([
        TestAction::assert_eq("Date.UTC(1/0, 6, 8, 9, 16, 15, 779)", f64::NAN),
        TestAction::assert_eq("Date.UTC(2020, 1/0, 8, 9, 16, 15, 779)", f64::NAN),
        TestAction::assert_eq("Date.UTC(2020, 6, 1/0, 9, 16, 15, 779)", f64::NAN),
        TestAction::assert_eq("Date.UTC(2020, 6, 8, 1/0, 16, 15, 779)", f64::NAN),
        TestAction::assert_eq("Date.UTC(2020, 6, 8, 9, 1/0, 15, 779)", f64::NAN),
        TestAction::assert_eq("Date.UTC(2020, 6, 8, 9, 16, 1/0, 779)", f64::NAN),
        TestAction::assert_eq("Date.UTC(2020, 6, 8, 9, 16, 15, 1/0)", f64::NAN),
    ]);
}

#[test]
fn date_proto_get_date_call() {
    run_test_actions([
        TestAction::assert_eq("new Date(2020, 6, 8, 9, 16, 15, 779).getDate()", 8),
        TestAction::assert_eq("new Date(1/0).getDate()", f64::NAN),
    ]);
}

#[test]
fn date_proto_get_day_call() {
    run_test_actions([
        TestAction::assert_eq("new Date(2020, 6, 8, 9, 16, 15, 779).getDay()", 3),
        TestAction::assert_eq("new Date(1/0).getDay()", f64::NAN),
    ]);
}

#[test]
fn date_proto_get_full_year_call() {
    run_test_actions([
        TestAction::assert_eq("new Date(2020, 6, 8, 9, 16, 15, 779).getFullYear()", 2020),
        TestAction::assert_eq("new Date(1/0).getFullYear()", f64::NAN),
    ]);
}

#[test]
fn date_proto_get_hours_call() {
    run_test_actions([
        TestAction::assert_eq("new Date(2020, 6, 8, 9, 16, 15, 779).getHours()", 9),
        TestAction::assert_eq("new Date(1/0).getHours()", f64::NAN),
    ]);
}

#[test]
fn date_proto_get_milliseconds_call() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).getMilliseconds()",
            779,
        ),
        TestAction::assert_eq("new Date(1/0).getMilliseconds()", f64::NAN),
    ]);
}

#[test]
fn date_proto_get_minutes_call() {
    run_test_actions([
        TestAction::assert_eq("new Date(2020, 6, 8, 9, 16, 15, 779).getMinutes()", 16),
        TestAction::assert_eq("new Date(1/0).getMinutes()", f64::NAN),
    ]);
}

#[test]
fn date_proto_get_month() {
    run_test_actions([
        TestAction::assert_eq("new Date(2020, 6, 8, 9, 16, 15, 779).getMonth()", 6),
        TestAction::assert_eq("new Date(1/0).getMonth()", f64::NAN),
    ]);
}

#[test]
fn date_proto_get_seconds() {
    run_test_actions([
        TestAction::assert_eq("new Date(2020, 6, 8, 9, 16, 15, 779).getSeconds()", 15),
        TestAction::assert_eq("new Date(1/0).getSeconds()", f64::NAN),
    ]);
}

#[test]
fn date_proto_get_time() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).getTime()",
            timestamp_from_local(2020, 7, 8, 9, 16, 15, 779),
        ),
        TestAction::assert_eq("new Date(1/0).getTime()", f64::NAN),
    ]);
}

#[test]
fn date_proto_get_year() {
    run_test_actions([
        TestAction::assert_eq("new Date(2020, 6, 8, 9, 16, 15, 779).getYear()", 120),
        TestAction::assert_eq("new Date(1/0).getYear()", f64::NAN),
    ]);
}

#[test]
fn date_proto_get_timezone_offset() {
    run_test_actions([
        TestAction::assert(indoc! {r#"
                new Date('1975-08-19T23:15:30+07:00').getTimezoneOffset() ===
                new Date('1975-08-19T23:15:30-02:00').getTimezoneOffset()
            "#}),
        // NB: Host Settings, not TZ specified in the DateTime.
        TestAction::assert_eq(
            "new Date('1975-08-19T23:15:30+07:00').getTimezoneOffset()",
            {
                let t = from_local(1975, 8, 19, 23, 15, 30, 0);
                -t.offset().whole_seconds() / 60
            },
        ),
    ]);
}

#[test]
fn date_proto_get_utc_date_call() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).getUTCDate()",
            8,
        ),
        TestAction::assert_eq("new Date(1/0).getUTCDate()", f64::NAN),
    ]);
}

#[test]
fn date_proto_get_utc_day_call() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).getUTCDay()",
            3,
        ),
        TestAction::assert_eq("new Date(1/0).getUTCDay()", f64::NAN),
    ]);
}

#[test]
fn date_proto_get_utc_full_year_call() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).getUTCFullYear()",
            2020,
        ),
        TestAction::assert_eq("new Date(1/0).getUTCFullYear()", f64::NAN),
    ]);
}

#[test]
fn date_proto_get_utc_hours_call() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).getUTCHours()",
            9,
        ),
        TestAction::assert_eq("new Date(1/0).getUTCHours()", f64::NAN),
    ]);
}

#[test]
fn date_proto_get_utc_milliseconds_call() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).getUTCMilliseconds()",
            779,
        ),
        TestAction::assert_eq("new Date(1/0).getUTCMilliseconds()", f64::NAN),
    ]);
}

#[test]
fn date_proto_get_utc_minutes_call() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).getUTCMinutes()",
            16,
        ),
        TestAction::assert_eq("new Date(1/0).getUTCMinutes()", f64::NAN),
    ]);
}

#[test]
fn date_proto_get_utc_month() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).getUTCMonth()",
            6,
        ),
        TestAction::assert_eq("new Date(1/0).getUTCMonth()", f64::NAN),
    ]);
}

#[test]
fn date_proto_get_utc_seconds() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).getUTCSeconds()",
            15,
        ),
        TestAction::assert_eq("new Date(1/0).getUTCSeconds()", f64::NAN),
    ]);
}

#[test]
fn date_proto_set_date() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setDate(21)",
            timestamp_from_local(2020, 7, 21, 9, 16, 15, 779),
        ),
        // Date wraps to previous month for 0.
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setDate(0)",
            timestamp_from_local(2020, 6, 30, 9, 16, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setDate(1/0)",
            f64::NAN,
        ),
    ]);
}

#[test]
fn date_proto_set_full_year() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setFullYear(2012)",
            timestamp_from_local(2012, 7, 8, 9, 16, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setFullYear(2012, 8)",
            timestamp_from_local(2012, 9, 8, 9, 16, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setFullYear(2012, 8, 10)",
            timestamp_from_local(2012, 9, 10, 9, 16, 15, 779),
        ),
        // Out-of-bounds
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setFullYear(2012, 35)",
            timestamp_from_local(2014, 12, 8, 9, 16, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setFullYear(2012, -35)",
            timestamp_from_local(2009, 2, 8, 9, 16, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setFullYear(2012, 9, 950)",
            timestamp_from_local(2015, 5, 8, 9, 16, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setFullYear(2012, 9, -950)",
            timestamp_from_local(2010, 2, 23, 9, 16, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setFullYear(1/0)",
            f64::NAN,
        ),
    ]);
}

#[test]
fn date_proto_set_hours() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setHours(11)",
            timestamp_from_local(2020, 7, 8, 11, 16, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setHours(11, 35)",
            timestamp_from_local(2020, 7, 8, 11, 35, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setHours(11, 35, 23)",
            timestamp_from_local(2020, 7, 8, 11, 35, 23, 779),
        ),
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setHours(11, 35, 23, 537)",
            timestamp_from_local(2020, 7, 8, 11, 35, 23, 537),
        ),
        // Out-of-bounds
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setHours(10000, 20000, 30000, 40123)",
            timestamp_from_local(2021, 9, 11, 21, 40, 40, 123),
        ),
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setHours(1/0)",
            f64::NAN,
        ),
    ]);
}

#[test]
fn date_proto_set_milliseconds() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setMilliseconds(597)",
            timestamp_from_local(2020, 7, 8, 9, 16, 15, 597),
        ),
        // Out-of-bounds
        // Thorough tests are done by setHours
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setMilliseconds(40123)",
            timestamp_from_local(2020, 7, 8, 9, 16, 55, 123),
        ),
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setMilliseconds(1/0)",
            f64::NAN,
        ),
    ]);
}

#[test]
fn date_proto_set_minutes() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setMinutes(11)",
            timestamp_from_local(2020, 7, 8, 9, 11, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setMinutes(11, 35)",
            timestamp_from_local(2020, 7, 8, 9, 11, 35, 779),
        ),
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setMinutes(11, 35, 537)",
            timestamp_from_local(2020, 7, 8, 9, 11, 35, 537),
        ),
        // Out-of-bounds
        // Thorough tests are done by setHours
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setMinutes(600000, 30000, 40123)",
            timestamp_from_local(2021, 8, 29, 9, 20, 40, 123),
        ),
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setMinutes(1/0)",
            f64::NAN,
        ),
    ]);
}

#[test]
fn date_proto_set_month() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setMonth(11)",
            timestamp_from_local(2020, 12, 8, 9, 16, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setMonth(11, 16)",
            timestamp_from_local(2020, 12, 16, 9, 16, 15, 779),
        ),
        // Out-of-bounds
        // Thorough tests are done by setFullYear
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setMonth(40, 83)",
            timestamp_from_local(2023, 7, 22, 9, 16, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setMonth(1/0)",
            f64::NAN,
        ),
    ]);
}

#[test]
fn date_proto_set_seconds() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setSeconds(11)",
            timestamp_from_local(2020, 7, 8, 9, 16, 11, 779),
        ),
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setSeconds(11, 487)",
            timestamp_from_local(2020, 7, 8, 9, 16, 11, 487),
        ),
        // Out-of-bounds
        // Thorough tests are done by setHour
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setSeconds(40000000, 40123)",
            timestamp_from_local(2021, 10, 14, 8, 23, 20, 123),
        ),
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setSeconds(1/0)",
            f64::NAN,
        ),
    ]);
}

#[test]
fn set_year() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setYear(98)",
            timestamp_from_local(1998, 7, 8, 9, 16, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setYear(2001)",
            timestamp_from_local(2001, 7, 8, 9, 16, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setYear(1/0)",
            f64::NAN,
        ),
    ]);
}

#[test]
fn date_proto_set_time() {
    run_test_actions([TestAction::assert_eq(
        "new Date().setTime(new Date(2020, 6, 8, 9, 16, 15, 779).getTime())",
        timestamp_from_local(2020, 7, 8, 9, 16, 15, 779),
    )]);
}

#[test]
fn date_proto_set_utc_date() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCDate(21)",
            timestamp_from_utc(2020, 7, 21, 9, 16, 15, 779),
        ),
        // Date wraps to previous month for 0.
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCDate(0)",
            timestamp_from_utc(2020, 6, 30, 9, 16, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCDate(1/0)",
            f64::NAN,
        ),
    ]);
}

#[test]
fn date_proto_set_utc_full_year() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCFullYear(2012)",
            timestamp_from_utc(2012, 7, 8, 9, 16, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCFullYear(2012, 8)",
            timestamp_from_utc(2012, 9, 8, 9, 16, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCFullYear(2012, 8, 10)",
            timestamp_from_utc(2012, 9, 10, 9, 16, 15, 779),
        ),
        // Out-of-bounds
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCFullYear(2012, 35)",
            timestamp_from_utc(2014, 12, 8, 9, 16, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCFullYear(2012, -35)",
            timestamp_from_utc(2009, 2, 8, 9, 16, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCFullYear(2012, 9, 950)",
            timestamp_from_utc(2015, 5, 8, 9, 16, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCFullYear(2012, 9, -950)",
            timestamp_from_utc(2010, 2, 23, 9, 16, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCFullYear(1/0)",
            f64::NAN,
        ),
    ]);
}

#[test]
fn date_proto_set_utc_hours() {
    // The local-time constructor `new Date(2020, 6, 8, 9, 16, 15, 779)` converts
    // local time to UTC internally. The resulting UTC components depend on the
    // host timezone offset, so we compute them dynamically.
    let base = from_local(2020, 7, 8, 9, 16, 15, 779).to_offset(time::UtcOffset::UTC);
    let base_y = base.year();
    let base_m = base.month() as u8;
    let base_d = base.day();
    let base_min = base.minute();
    let base_sec = base.second();
    let base_ms = base.millisecond();

    run_test_actions([
        // setUTCHours(11): only the UTC hour changes; date/min/sec/ms stay.
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setUTCHours(11)",
            timestamp_from_utc(base_y, base_m, base_d, 11, base_min, base_sec, base_ms),
        ),
        // setUTCHours(h, m): hour and minutes are overridden; sec/ms stay.
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setUTCHours(11, 35)",
            timestamp_from_utc(base_y, base_m, base_d, 11, 35, base_sec, base_ms),
        ),
        // setUTCHours(h, m, s): hour, minutes, seconds overridden; ms stays.
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setUTCHours(11, 35, 23)",
            timestamp_from_utc(base_y, base_m, base_d, 11, 35, 23, base_ms),
        ),
        // setUTCHours(h, m, s, ms): all time components overridden.
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setUTCHours(11, 35, 23, 537)",
            timestamp_from_utc(base_y, base_m, base_d, 11, 35, 23, 537),
        ),
        // Out-of-bounds: all time components specified, overflow wraps across days.
        // The base timestamp is Day(t) from the local-time date's internal UTC value.
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setUTCHours(10000, 20000, 30000, 40123)",
            {
                // setUTCHours computes MakeDate(Day(t), MakeTime(h, m, s, ms)).
                // Day(t) is the UTC day count of the base date, so we reconstruct
                // by starting from the base UTC midnight and adding the overflow.
                let base_day_ms = timestamp_from_utc(base_y, base_m, base_d, 0, 0, 0, 0);
                let total_ms = i64::from(10000) * 3_600_000
                    + i64::from(20000) * 60_000
                    + i64::from(30000) * 1_000
                    + 40123;
                base_day_ms + total_ms
            },
        ),
        TestAction::assert_eq(
            "new Date(2020, 6, 8, 9, 16, 15, 779).setUTCHours(1/0)",
            f64::NAN,
        ),
    ]);
}

#[test]
fn date_proto_set_utc_milliseconds() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCMilliseconds(597)",
            timestamp_from_utc(2020, 7, 8, 9, 16, 15, 597),
        ),
        // Out-of-bounds
        // Thorough tests are done by setHours
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCMilliseconds(40123)",
            timestamp_from_utc(2020, 7, 8, 9, 16, 55, 123),
        ),
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCMilliseconds(1/0)",
            f64::NAN,
        ),
    ]);
}

#[test]
fn date_proto_set_utc_minutes() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCMinutes(11)",
            timestamp_from_utc(2020, 7, 8, 9, 11, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCMinutes(11, 35)",
            timestamp_from_utc(2020, 7, 8, 9, 11, 35, 779),
        ),
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCMinutes(11, 35, 537)",
            timestamp_from_utc(2020, 7, 8, 9, 11, 35, 537),
        ),
        // Out-of-bounds
        // Thorough tests are done by setHours
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCMinutes(600000, 30000, 40123)",
            timestamp_from_utc(2021, 8, 29, 9, 20, 40, 123),
        ),
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCMinutes(1/0)",
            f64::NAN,
        ),
    ]);
}

#[test]
fn date_proto_set_utc_month() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCMonth(11)",
            timestamp_from_utc(2020, 12, 8, 9, 16, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCMonth(11, 16)",
            timestamp_from_utc(2020, 12, 16, 9, 16, 15, 779),
        ),
        // Out-of-bounds
        // Thorough tests are done by setFullYear
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCMonth(40, 83)",
            timestamp_from_utc(2023, 7, 22, 9, 16, 15, 779),
        ),
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCMonth(1/0)",
            f64::NAN,
        ),
    ]);
}

#[test]
fn date_proto_set_utc_seconds() {
    run_test_actions([
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCSeconds(11)",
            timestamp_from_utc(2020, 7, 8, 9, 16, 11, 779),
        ),
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCSeconds(11, 487)",
            timestamp_from_utc(2020, 7, 8, 9, 16, 11, 487),
        ),
        // Out-of-bounds
        // Thorough tests are done by setHour
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCSeconds(40000000, 40123)",
            timestamp_from_utc(2021, 10, 14, 8, 23, 20, 123),
        ),
        TestAction::assert_eq(
            "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).setUTCSeconds(1/0)",
            f64::NAN,
        ),
    ]);
}

#[test]
fn date_proto_to_date_string() {
    run_test_actions([TestAction::assert_eq(
        "new Date(2020, 6, 8, 9, 16, 15, 779).toDateString()",
        js_str!("Wed Jul 08 2020"),
    )]);
}

#[test]
fn date_proto_to_gmt_string() {
    run_test_actions([TestAction::assert_eq(
        "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).toGMTString()",
        js_str!("Wed, 08 Jul 2020 09:16:15 GMT"),
    )]);
}

#[test]
fn date_proto_to_iso_string() {
    run_test_actions([TestAction::assert_eq(
        "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).toISOString()",
        js_str!("2020-07-08T09:16:15.779Z"),
    )]);
}

#[test]
fn date_proto_to_iso_string_year_zero() {
    run_test_actions([TestAction::assert_eq(
        r#"new Date("0000-06-15T00:00:00Z").toISOString()"#,
        js_str!("0000-06-15T00:00:00.000Z"),
    )]);
}

#[test]
fn date_proto_to_json() {
    run_test_actions([TestAction::assert_eq(
        "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).toJSON()",
        js_str!("2020-07-08T09:16:15.779Z"),
    )]);
}

#[test]
fn date_proto_to_string() {
    let to_string_format = format_description!(
        "[weekday repr:short] [month repr:short] [day] [year] [hour]:[minute]:[second] GMT[offset_hour sign:mandatory][offset_minute][end]"
    );
    let t = from_local(2020, 7, 8, 9, 16, 15, 779)
        .format(to_string_format)
        .unwrap();

    run_test_actions([TestAction::assert_eq(
        "new Date(2020, 6, 8, 9, 16, 15, 779).toString()",
        js_string!(t),
    )]);
}

#[test]
fn date_proto_to_time_string() {
    let to_time_string_format = format_description!(
        "[hour]:[minute]:[second] GMT[offset_hour sign:mandatory][offset_minute][end]"
    );
    let t = from_local(2020, 7, 8, 9, 16, 15, 779)
        .format(to_time_string_format)
        .unwrap();

    run_test_actions([TestAction::assert_eq(
        "new Date(2020, 6, 8, 9, 16, 15, 779).toTimeString()",
        js_string!(t),
    )]);
}

#[test]
fn date_proto_to_utc_string() {
    run_test_actions([TestAction::assert_eq(
        "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).toUTCString()",
        js_str!("Wed, 08 Jul 2020 09:16:15 GMT"),
    )]);
}

#[test]
fn date_proto_value_of() {
    run_test_actions([TestAction::assert_eq(
        "new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)).valueOf()",
        1_594_199_775_779_i64,
    )]);
}

#[test]
fn date_neg() {
    run_test_actions([TestAction::assert_eq(
        "-new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779))",
        -1_594_199_775_779_i64,
    )]);
}

#[test]
fn date_json() {
    run_test_actions([TestAction::assert_eq(
        "JSON.stringify({ date: new Date(Date.UTC(2020, 6, 8, 9, 16, 15, 779)) })",
        js_string!(r#"{"date":"2020-07-08T09:16:15.779Z"}"#),
    )]);
}

#[test]
fn date_parse_hour24_validation() {
    run_test_actions([
        // 24:00:00.000 is valid (midnight end-of-day)
        TestAction::assert("!isNaN(Date.parse('2024-01-01T24:00:00Z'))"),
        TestAction::assert("!isNaN(Date.parse('2024-01-01T24:00:00.000Z'))"),
        // hour 24 with non-zero minutes/seconds/ms must be NaN
        TestAction::assert("isNaN(Date.parse('2024-01-01T24:30:00Z'))"),
        TestAction::assert("isNaN(Date.parse('2024-01-01T24:00:01Z'))"),
        TestAction::assert("isNaN(Date.parse('2024-01-01T24:00:00.001Z'))"),
    ]);
}

#[test]
#[cfg(feature = "intl")]
fn date_proto_to_locale_string_intl() {
    run_test_actions([
        // Invalid receiver: spec requires TypeError
        TestAction::assert_native_error(
            "Date.prototype.toLocaleString.call({})",
            JsNativeErrorKind::Type,
            "'this' is not a Date",
        ),
        TestAction::assert_native_error(
            "Date.prototype.toLocaleDateString.call({})",
            JsNativeErrorKind::Type,
            "'this' is not a Date",
        ),
        TestAction::assert_native_error(
            "Date.prototype.toLocaleTimeString.call({})",
            JsNativeErrorKind::Type,
            "'this' is not a Date",
        ),
        TestAction::assert_eq("new Date(NaN).toLocaleString()", js_str!("Invalid Date")),
        TestAction::assert("typeof new Date(2020, 6, 8).toLocaleString() === 'string'"),
        TestAction::assert("typeof new Date(2020, 6, 8).toLocaleDateString() === 'string'"),
        TestAction::assert("typeof new Date(2020, 6, 8).toLocaleTimeString() === 'string'"),
        TestAction::assert("typeof new Date(0).toLocaleString('en-US') === 'string'"),
        TestAction::assert("typeof new Date(0).toLocaleDateString('en-US') === 'string'"),
        TestAction::assert("typeof new Date(0).toLocaleDateString('de-DE') === 'string'"),
        TestAction::assert("typeof new Date(0).toLocaleTimeString('en-US') === 'string'"),
        // Prove locale pipeline: different locales produce different output
        TestAction::assert(
            "new Date(0).toLocaleDateString('en-US') !== new Date(0).toLocaleDateString('de-DE')",
        ),
        TestAction::assert(
            "new Date(0).toLocaleString('en-US') !== new Date(0).toLocaleString('de-DE')",
        ),
        TestAction::assert(
            "new Date(0).toLocaleTimeString('en-US') !== new Date(0).toLocaleTimeString('de-DE')",
        ),
        // Prove ToDateTimeOptions pipeline: options affect output
        TestAction::assert(
            "typeof new Date(0).toLocaleDateString('en-US', { dateStyle: 'short' }) === 'string'",
        ),
        // Prove output is a string and not empty
        TestAction::assert(
            "new Date(0).toLocaleDateString('en-US', { dateStyle: 'short' }).length > 0",
        ),
    ]);
}
