use boa_macros::js_str;
use indoc::indoc;

use crate::{JsNativeErrorKind, JsValue, TestAction, js_string, run_test_actions};

#[test]
fn length() {
    //TEST262: https://github.com/tc39/test262/blob/master/test/built-ins/String/length.js
    run_test_actions([
        TestAction::run(indoc! {r"
                const a = new String(' ');
                const b = new String('\ud834\udf06');
                const c = new String(' \b ');
                const d = new String('中文长度')
            "}),
        // unicode surrogate pair length should be 1
        // utf16/usc2 length should be 2
        // utf8 length should be 4
        TestAction::assert_eq("a.length", 1),
        TestAction::assert_eq("b.length", 2),
        TestAction::assert_eq("c.length", 3),
        TestAction::assert_eq("d.length", 4),
    ]);
}

#[test]
fn new_string_has_length() {
    run_test_actions([
        TestAction::run("let a = new String(\"1234\");"),
        TestAction::assert_eq("a.length", 4),
    ]);
}

#[test]
fn new_string_has_length_not_enumerable() {
    run_test_actions([
        TestAction::run("let a = new String(\"1234\");"),
        TestAction::assert("!a.propertyIsEnumerable('length')"),
    ]);
}

#[test]
fn new_utf8_string_has_length() {
    run_test_actions([
        TestAction::run("let a = new String(\"中文\");"),
        TestAction::assert_eq("a.length", 2),
    ]);
}

#[test]
fn concat() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var hello = new String('Hello, ');
                var world = new String('world! ');
                var nice = new String('Have a nice day.');
            "#}),
        TestAction::assert_eq(
            "hello.concat(world, nice)",
            js_str!("Hello, world! Have a nice day."),
        ),
        TestAction::assert_eq(
            "hello + world + nice",
            js_str!("Hello, world! Have a nice day."),
        ),
    ]);
}

#[test]
fn generic_concat() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                Number.prototype.concat = String.prototype.concat;
                let number = new Number(100);
            "#}),
        TestAction::assert_eq("number.concat(' - 50', ' = 50')", js_str!("100 - 50 = 50")),
    ]);
}

#[test]
/// Test the correct type is returned from call and construct
fn construct_and_call() {
    run_test_actions([
        TestAction::assert_with_op("new String('Hello')", |v, _| v.is_object()),
        TestAction::assert_with_op("String('world')", |v, _| v.is_string()),
    ]);
}

#[test]
fn repeat() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            var empty = new String('');
            var en = new String('english');
            var zh = new String('中文');
        "#}),
        TestAction::assert_eq("empty.repeat(0)", js_string!()),
        TestAction::assert_eq("empty.repeat(1)", js_string!()),
        TestAction::assert_eq("en.repeat(0)", js_string!()),
        TestAction::assert_eq("zh.repeat(0)", js_string!()),
        TestAction::assert_eq("en.repeat(1)", js_str!("english")),
        TestAction::assert_eq("zh.repeat(2)", js_str!("中文中文")),
    ]);
}

#[test]
fn repeat_respects_loop_limit() {
    run_test_actions([
        // Set a small loop iteration limit so long repeats trip it.
        TestAction::inspect_context(|context| {
            context.runtime_limits_mut().set_loop_iteration_limit(10);
        }),
        // Plain JS loop should hit the runtime limit.
        TestAction::assert_runtime_limit_error(
            "for (let i = 0; i < 100; ++i) {}",
            crate::error::RuntimeLimitError::LoopIteration,
        ),
        // String.prototype.repeat should use the same mechanism and error.
        TestAction::assert_runtime_limit_error(
            "'x'.repeat(100)",
            crate::error::RuntimeLimitError::LoopIteration,
        ),
    ]);
}

#[test]
fn repeat_large_count_hits_limit() {
    run_test_actions([
        TestAction::inspect_context(|context| {
            context.runtime_limits_mut().set_loop_iteration_limit(50);
        }),
        // Large repeat count with a small loop limit should raise the same runtime limit error.
        TestAction::assert_runtime_limit_error(
            "'a'.repeat(10_000)",
            crate::error::RuntimeLimitError::LoopIteration,
        ),
    ]);
}

#[test]
fn repeat_throws_when_count_is_negative() {
    run_test_actions([TestAction::assert_native_error(
        "'x'.repeat(-1)",
        JsNativeErrorKind::Range,
        "String.prototype.repeat: count must be non-negative",
    )]);
}

#[test]
fn repeat_throws_when_count_is_infinity() {
    run_test_actions([TestAction::assert_native_error(
        "'x'.repeat(Infinity)",
        JsNativeErrorKind::Range,
        "String.prototype.repeat: count must be less than infinity",
    )]);
}

#[test]
fn repeat_throws_when_count_overflows_max_length() {
    run_test_actions([TestAction::assert_native_error(
        "'x'.repeat(2 ** 64)",
        JsNativeErrorKind::Range,
        "repeat count must be a positive finite number \
                  that doesn't overflow the maximum string length (2^32 - 1)",
    )]);
}

#[test]
fn repeat_generic() {
    run_test_actions([
        TestAction::run("Number.prototype.repeat = String.prototype.repeat;"),
        TestAction::assert_eq("(0).repeat(0)", js_string!()),
        TestAction::assert_eq("(1).repeat(1)", js_str!("1")),
        TestAction::assert_eq("(1).repeat(5)", js_str!("11111")),
        TestAction::assert_eq("(12).repeat(3)", js_str!("121212")),
    ]);
}

#[test]
fn replace() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            "abc".replace("a", "2")
        "#},
        js_str!("2bc"),
    )]);
}

#[test]
fn replace_no_match() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            "abc".replace(/d/, "$&$&")
        "#},
        js_str!("abc"),
    )]);
}

#[test]
fn replace_with_capture_groups() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            "John Smith".replace(/(\w+)\s(\w+)/, '$2, $1')
        "#},
        js_str!("Smith, John"),
    )]);
}

#[test]
fn replace_with_tenth_capture_group() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            var re = /(\d)(\d)(\d)(\d)(\d)(\d)(\d)(\d)(\d)(\d)/;
            "0123456789".replace(re, '$10')
        "#},
        js_str!("9"),
    )]);
}

#[test]
fn replace_substitutions() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            var re = / two /;
            var a = "one two three";
            var dollar = a.replace(re, " $$ ");
            var matched = a.replace(re, "$&$&");
            var start = a.replace(re, " $` ");
            var end = a.replace(re, " $' ");
            var no_sub = a.replace(re, " $_ ");
        "#}),
        TestAction::assert_eq("a.replace(re, \" $$ \")", js_str!("one $ three")),
        TestAction::assert_eq("a.replace(re, \"$&$&\")", js_str!("one two  two three")),
        TestAction::assert_eq("a.replace(re, \" $` \")", js_str!("one one three")),
        TestAction::assert_eq("a.replace(re, \" $' \")", js_str!("one three three")),
        TestAction::assert_eq("a.replace(re, \" $_ \")", js_str!("one $_ three")),
    ]);
}

#[test]
fn replace_with_function() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var p1, p2, p3, length;
                var replacer = (match, cap1, cap2, cap3, len) => {
                    p1 = cap1;
                    p2 = cap2;
                    p3 = cap3;
                    length = len;
                    return "awesome!";
                };
            "#}),
        TestAction::assert_eq(
            "\"ecmascript is cool\".replace(/c(o)(o)(l)/, replacer)",
            js_str!("ecmascript is awesome!"),
        ),
        TestAction::assert_eq("p1", js_str!("o")),
        TestAction::assert_eq("p2", js_str!("o")),
        TestAction::assert_eq("p3", js_str!("l")),
        TestAction::assert_eq("length", 14),
    ]);
}

#[test]
fn starts_with() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var empty = '';
                var en = 'english';
                var zh = '中文';
            "#}),
        TestAction::assert("empty.startsWith('')"),
        TestAction::assert("en.startsWith('e')"),
        TestAction::assert("zh.startsWith('中')"),
        TestAction::assert("(new String(empty)).startsWith('')"),
        TestAction::assert("(new String(en)).startsWith('e')"),
        TestAction::assert("(new String(zh)).startsWith('中')"),
    ]);
}

#[test]
fn starts_with_with_regex_arg() {
    run_test_actions([TestAction::assert_native_error(
        "'Saturday night'.startsWith(/Saturday/)",
        JsNativeErrorKind::Type,
        "First argument to String.prototype.startsWith must not be a regular expression",
    )]);
}

#[test]
fn ends_with() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var empty = '';
                var en = 'english';
                var zh = '中文';
            "#}),
        TestAction::assert("empty.endsWith('')"),
        TestAction::assert("en.endsWith('h')"),
        TestAction::assert("zh.endsWith('文')"),
        TestAction::assert("(new String(empty)).endsWith('')"),
        TestAction::assert("(new String(en)).endsWith('h')"),
        TestAction::assert("(new String(zh)).endsWith('文')"),
    ]);
}

#[test]
fn ends_with_with_regex_arg() {
    run_test_actions([TestAction::assert_native_error(
        "'Saturday night'.endsWith(/night/)",
        JsNativeErrorKind::Type,
        "First argument to String.prototype.endsWith must not be a regular expression",
    )]);
}

#[test]
fn includes() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var empty = '';
                var en = 'english';
                var zh = '中文';
            "#}),
        TestAction::assert("empty.includes('')"),
        TestAction::assert("en.includes('g')"),
        TestAction::assert("zh.includes('文')"),
        TestAction::assert("(new String(empty)).includes('')"),
        TestAction::assert("(new String(en)).includes('g')"),
        TestAction::assert("(new String(zh)).includes('文')"),
    ]);
}

#[test]
fn includes_with_regex_arg() {
    run_test_actions([TestAction::assert_native_error(
        "'Saturday night'.includes(/day/)",
        JsNativeErrorKind::Type,
        "First argument to String.prototype.includes must not be a regular expression",
    )]);
}

#[test]
fn match_all_one() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run(indoc! {r"
            var groupMatches = 'test1test2'.matchAll(/t(e)(st(\d?))/g);
            var m1 = groupMatches.next();
            var m2 = groupMatches.next();
            var m3 = groupMatches.next();
        "}),
        TestAction::assert("!m1.done"),
        TestAction::assert("!m2.done"),
        TestAction::assert("m3.done"),
        TestAction::assert(indoc! {r#"
            arrayEquals(
                m1.value,
                ["test1", "e", "st1", "1"]
            )
        "#}),
        TestAction::assert_eq("m1.value.index", 0),
        TestAction::assert_eq("m1.value.input", js_str!("test1test2")),
        TestAction::assert_eq("m1.value.groups", JsValue::undefined()),
        TestAction::assert(indoc! {r#"
            arrayEquals(
                m2.value,
                ["test2", "e", "st2", "2"]
            )
        "#}),
        TestAction::assert_eq("m2.value.index", 5),
        TestAction::assert_eq("m2.value.input", js_str!("test1test2")),
        TestAction::assert_eq("m2.value.groups", JsValue::undefined()),
        TestAction::assert_eq("m3.value", JsValue::undefined()),
    ]);
}

#[test]
fn match_all_two() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run(indoc! {r#"
            var regexp = RegExp('foo[a-z]*','g');
            var str = 'table football, foosball';
            var matches = str.matchAll(regexp);
            var m1 = matches.next();
            var m2 = matches.next();
            var m3 = matches.next();
        "#}),
        TestAction::assert("!m1.done"),
        TestAction::assert("!m2.done"),
        TestAction::assert("m3.done"),
        TestAction::assert(indoc! {r#"
            arrayEquals(
                m1.value,
                ["football"]
            )
        "#}),
        TestAction::assert_eq("m1.value.index", 6),
        TestAction::assert_eq("m1.value.input", js_str!("table football, foosball")),
        TestAction::assert_eq("m1.value.groups", JsValue::undefined()),
        TestAction::assert(indoc! {r#"
            arrayEquals(
                m2.value,
                ["foosball"]
            )
        "#}),
        TestAction::assert_eq("m2.value.index", 16),
        TestAction::assert_eq("m2.value.input", js_str!("table football, foosball")),
        TestAction::assert_eq("m2.value.groups", JsValue::undefined()),
        TestAction::assert_eq("m3.value", JsValue::undefined()),
    ]);
}

#[test]
fn test_match() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run(indoc! {r#"
                var str = new String('The Quick Brown Fox Jumps Over The Lazy Dog');
                var result1 = str.match(/quick\s(brown).+?(jumps)/i);
                var result2 = str.match(/[A-Z]/g);
                var result3 = str.match("T");
                var result4 = str.match(RegExp("B", 'g'));
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    result1,
                    ["Quick Brown Fox Jumps", "Brown", "Jumps"]
                )
            "#}),
        TestAction::assert_eq("result1.index", 4),
        TestAction::assert_eq(
            "result1.input",
            js_str!("The Quick Brown Fox Jumps Over The Lazy Dog"),
        ),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    result2,
                    ["T", "Q", "B", "F", "J", "O", "T", "L", "D"]
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    result3,
                    ["T"]
                )
            "#}),
        TestAction::assert_eq("result3.index", 0),
        TestAction::assert_eq(
            "result3.input",
            js_str!("The Quick Brown Fox Jumps Over The Lazy Dog"),
        ),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    result4,
                    ["B"]
                )
            "#}),
    ]);
}

#[test]
fn trim() {
    run_test_actions([
        TestAction::assert_eq(r"'Hello'.trim()", js_str!("Hello")),
        TestAction::assert_eq(r"' \nHello'.trim()", js_str!("Hello")),
        TestAction::assert_eq(r"'Hello \n\r'.trim()", js_str!("Hello")),
        TestAction::assert_eq(r"' Hello '.trim()", js_str!("Hello")),
    ]);
}

#[test]
fn trim_start() {
    run_test_actions([
        TestAction::assert_eq(r"'Hello'.trimStart()", js_str!("Hello")),
        TestAction::assert_eq(r"' \nHello'.trimStart()", js_str!("Hello")),
        TestAction::assert_eq(r"'Hello \n\r'.trimStart()", js_str!("Hello \n\r")),
        TestAction::assert_eq(r"' Hello '.trimStart()", js_str!("Hello ")),
    ]);
}

#[test]
fn trim_end() {
    run_test_actions([
        TestAction::assert_eq(r"'Hello'.trimEnd()", js_str!("Hello")),
        TestAction::assert_eq(r"' \nHello'.trimEnd()", js_str!(" \nHello")),
        TestAction::assert_eq(r"'Hello \n\r'.trimEnd()", js_str!("Hello")),
        TestAction::assert_eq(r"' Hello '.trimEnd()", js_str!(" Hello")),
    ]);
}

#[test]
fn split() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    "Hello".split(),
                    ["Hello"]
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    'Hello'.split(null),
                    ['Hello']
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    'Hello'.split(undefined),
                    ['Hello']
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    'Hello'.split(''),
                    ['H','e','l','l','o']
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    'x1x2'.split('x'),
                    ['','1','2']
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    'x1x2x'.split('x'),
                    ['','1','2','']
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    'x1x2x'.split('x', 0),
                    []
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    'x1x2x'.split('x', 2),
                    ['','1']
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    'x1x2x'.split('x', 10),
                    ['','1','2','']
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    'x1x2x'.split(1),
                    ['x','x2x']
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    'Hello'.split(null, 0),
                    []
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    'Hello'.split(undefined, 0),
                    []
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    ''.split(),
                    ['']
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    ''.split(undefined),
                    ['']
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    ''.split(''),
                    []
                )
            "#}),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    ''.split('1'),
                    ['']
                )
            "#}),
        TestAction::assert(indoc! {r"
                arrayEquals(
                    '\u{1D7D8}\u{1D7D9}\u{1D7DA}\u{1D7DB}'.split(''),
                    ['\uD835', '\uDFD8', '\uD835', '\uDFD9', '\uD835', '\uDFDA', '\uD835', '\uDFDB']
                )
            "}),
    ]);
}

#[test]
fn split_with_symbol_split_method() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert_eq(
            indoc! {r#"
                let sep_a = {};
                sep_a[Symbol.split] = function(s, limit) { return s + limit.toString(); };
                'hello'.split(sep_a, 10)
            "#},
            js_str!("hello10"),
        ),
        TestAction::assert(indoc! {r#"
                let sep_b = {};
                sep_b[Symbol.split] = undefined;
                arrayEquals(
                    'hello'.split(sep_b),
                    ['hello']
                )
            "#}),
        TestAction::assert_native_error(
            indoc! {r#"
                let sep_c = {};
                sep_c[Symbol.split] = 10;
                'hello'.split(sep_c, 10);
            "#},
            JsNativeErrorKind::Type,
            "value returned for property of object is not a function",
        ),
    ]);
}

#[test]
fn index_of_with_no_arguments() {
    run_test_actions([
        TestAction::assert_eq("''.indexOf()", -1),
        TestAction::assert_eq("'undefined'.indexOf()", 0),
        TestAction::assert_eq("'a1undefined'.indexOf()", 2),
        TestAction::assert_eq("'a1undefined1a'.indexOf()", 2),
        TestAction::assert_eq("'µµµundefined'.indexOf()", 3),
        TestAction::assert_eq("'µµµundefinedµµµ'.indexOf()", 3),
    ]);
}

#[test]
fn index_of_with_string_search_string_argument() {
    run_test_actions([
        TestAction::assert_eq("''.indexOf('undefined')", -1),
        TestAction::assert_eq("'undefined'.indexOf('undefined')", 0),
        TestAction::assert_eq("'a1undefined'.indexOf('undefined')", 2),
        TestAction::assert_eq("'a1undefined1a'.indexOf('undefined')", 2),
        TestAction::assert_eq("'µµµundefined'.indexOf('undefined')", 3),
        TestAction::assert_eq("'µµµundefinedµµµ'.indexOf('undefined')", 3),
    ]);
}

#[test]
fn index_of_with_non_string_search_string_argument() {
    run_test_actions([
        TestAction::assert_eq("''.indexOf(1)", -1),
        TestAction::assert_eq("'1'.indexOf(1)", 0),
        TestAction::assert_eq("'true'.indexOf(true)", 0),
        TestAction::assert_eq("'ab100ba'.indexOf(100)", 2),
        TestAction::assert_eq("'µµµfalse'.indexOf(true)", -1),
        TestAction::assert_eq("'µµµ5µµµ'.indexOf(5)", 3),
    ]);
}

#[test]
fn index_of_with_from_index_argument() {
    run_test_actions([
        TestAction::assert_eq("''.indexOf('x', 2)", -1),
        TestAction::assert_eq("'x'.indexOf('x', 2)", -1),
        TestAction::assert_eq("'abcx'.indexOf('x', 2)", 3),
        TestAction::assert_eq("'µµµxµµµ'.indexOf('x', 2)", 3),
        TestAction::assert_eq("'µµµxµµµ'.indexOf('x', 10000000)", -1),
    ]);
}

#[test]
fn generic_index_of() {
    run_test_actions([
        TestAction::run("Number.prototype.indexOf = String.prototype.indexOf"),
        TestAction::assert_eq("'10'.indexOf(9)", -1),
        TestAction::assert_eq("'10'.indexOf(0)", 1),
        TestAction::assert_eq("'10'.indexOf('0')", 1),
    ]);
}

#[test]
fn index_of_empty_search_string() {
    run_test_actions([
        TestAction::assert_eq("''.indexOf('')", 0),
        TestAction::assert_eq("''.indexOf('', 10)", 0),
        TestAction::assert_eq("'ABC'.indexOf('', 1)", 1),
        TestAction::assert_eq("'ABC'.indexOf('', 2)", 2),
        TestAction::assert_eq("'ABC'.indexOf('', 10)", 3),
    ]);
}

#[test]
fn last_index_of_with_no_arguments() {
    run_test_actions([
        TestAction::assert_eq("''.lastIndexOf()", -1),
        TestAction::assert_eq("'undefined'.lastIndexOf()", 0),
        TestAction::assert_eq("'a1undefined'.lastIndexOf()", 2),
        TestAction::assert_eq("'a1undefined1aundefined'.lastIndexOf()", 13),
        TestAction::assert_eq("'µµµundefinedundefined'.lastIndexOf()", 12),
        TestAction::assert_eq("'µµµundefinedµµµundefined'.lastIndexOf()", 15),
    ]);
}

#[test]
fn last_index_of_with_string_search_string_argument() {
    run_test_actions([
        TestAction::assert_eq("''.lastIndexOf('hello')", -1),
        TestAction::assert_eq("'undefined'.lastIndexOf('undefined')", 0),
        TestAction::assert_eq("'a1undefined'.lastIndexOf('undefined')", 2),
        TestAction::assert_eq("'a1undefined1aundefined'.lastIndexOf('undefined')", 13),
        TestAction::assert_eq("'µµµundefinedundefined'.lastIndexOf('undefined')", 12),
        TestAction::assert_eq("'µµµundefinedµµµundefined'.lastIndexOf('undefined')", 15),
    ]);
}

#[test]
fn last_index_of_with_non_string_search_string_argument() {
    run_test_actions([
        TestAction::assert_eq("''.lastIndexOf(1)", -1),
        TestAction::assert_eq("'1'.lastIndexOf(1)", 0),
        TestAction::assert_eq("'11'.lastIndexOf(1)", 1),
        TestAction::assert_eq("'truefalsetrue'.lastIndexOf(true)", 9),
        TestAction::assert_eq("'ab100ba'.lastIndexOf(100)", 2),
        TestAction::assert_eq("'µµµfalse'.lastIndexOf(true)", -1),
        TestAction::assert_eq("'µµµ5µµµ65µ'.lastIndexOf(5)", 8),
    ]);
}

#[test]
fn last_index_of_with_from_index_argument() {
    run_test_actions([
        TestAction::assert_eq("''.lastIndexOf('x', 2)", -1),
        TestAction::assert_eq("'x'.lastIndexOf('x', 2)", 0),
        TestAction::assert_eq("'abcxx'.lastIndexOf('x', 2)", -1),
        TestAction::assert_eq("'µµµxµµµ'.lastIndexOf('x', 2)", -1),
        TestAction::assert_eq("'µµµxµµµ'.lastIndexOf('x', 10000000)", 3),
    ]);
}

#[test]
fn last_index_with_empty_search_string() {
    run_test_actions([
        TestAction::assert_eq("''.lastIndexOf('')", 0),
        TestAction::assert_eq("'x'.lastIndexOf('', 2)", 1),
        TestAction::assert_eq("'abcxx'.lastIndexOf('', 4)", 4),
        TestAction::assert_eq("'µµµxµµµ'.lastIndexOf('', 2)", 2),
        TestAction::assert_eq("'µµµxµµµ'.lastIndexOf('', 10000000)", 7),
    ]);
}

#[test]
fn generic_last_index_of() {
    run_test_actions([
        TestAction::run("Number.prototype.lastIndexOf = String.prototype.lastIndexOf"),
        TestAction::assert_eq("(1001).lastIndexOf(9)", -1),
        TestAction::assert_eq("(1001).lastIndexOf(0)", 2),
        TestAction::assert_eq("(1001).lastIndexOf('0')", 2),
    ]);
}

#[test]
fn last_index_non_integer_position_argument() {
    run_test_actions([
        TestAction::assert_eq("''.lastIndexOf('x', new Number(4))", -1),
        TestAction::assert_eq("'abc'.lastIndexOf('b', new Number(1))", 1),
        TestAction::assert_eq("'abcx'.lastIndexOf('x', new String('1'))", -1),
        TestAction::assert_eq("'abcx'.lastIndexOf('x', new String('100'))", 3),
        TestAction::assert_eq("'abcx'.lastIndexOf('x', null)", -1),
    ]);
}

#[test]
fn char_at() {
    run_test_actions([
        TestAction::assert_eq("'abc'.charAt(-1)", js_string!()),
        TestAction::assert_eq("'abc'.charAt(1)", js_str!("b")),
        TestAction::assert_eq("'abc'.charAt(9)", js_string!()),
        TestAction::assert_eq("'abc'.charAt()", js_str!("a")),
        TestAction::assert_eq("'abc'.charAt(null)", js_str!("a")),
        TestAction::assert_eq(r"'\uDBFF'.charAt(0)", js_string!(&[0xDBFFu16])),
    ]);
}

#[test]
fn char_code_at() {
    run_test_actions([
        TestAction::assert_eq("'abc'.charCodeAt(-1)", f64::NAN),
        TestAction::assert_eq("'abc'.charCodeAt(1)", 98),
        TestAction::assert_eq("'abc'.charCodeAt(9)", f64::NAN),
        TestAction::assert_eq("'abc'.charCodeAt()", 97),
        TestAction::assert_eq("'abc'.charCodeAt(null)", 97),
        TestAction::assert_eq("'\\uFFFF'.charCodeAt(0)", 65535),
    ]);
}

#[test]
fn code_point_at() {
    run_test_actions([
        TestAction::assert_eq("'abc'.codePointAt(-1)", JsValue::undefined()),
        TestAction::assert_eq("'abc'.codePointAt(1)", 98),
        TestAction::assert_eq("'abc'.codePointAt(9)", JsValue::undefined()),
        TestAction::assert_eq("'abc'.codePointAt()", 97),
        TestAction::assert_eq("'abc'.codePointAt(null)", 97),
        TestAction::assert_eq(r"'\uD800\uDC00'.codePointAt(0)", 65_536),
        TestAction::assert_eq(r"'\uD800\uDFFF'.codePointAt(0)", 66_559),
        TestAction::assert_eq(r"'\uDBFF\uDC00'.codePointAt(0)", 1_113_088),
        TestAction::assert_eq(r"'\uDBFF\uDFFF'.codePointAt(0)", 1_114_111),
        TestAction::assert_eq(r"'\uD800\uDC00'.codePointAt(1)", 56_320),
        TestAction::assert_eq(r"'\uD800\uDFFF'.codePointAt(1)", 57_343),
        TestAction::assert_eq(r"'\uDBFF\uDC00'.codePointAt(1)", 56_320),
        TestAction::assert_eq(r"'\uDBFF\uDFFF'.codePointAt(1)", 57_343),
    ]);
}

#[test]
fn slice() {
    run_test_actions([
        TestAction::assert_eq("'abc'.slice()", js_str!("abc")),
        TestAction::assert_eq("'abc'.slice(1)", js_str!("bc")),
        TestAction::assert_eq("'abc'.slice(-1)", js_str!("c")),
        TestAction::assert_eq("'abc'.slice(0, 9)", js_str!("abc")),
        TestAction::assert_eq("'abc'.slice(9, 10)", js_string!()),
    ]);
}

#[test]
fn empty_iter() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                let iter = new String()[Symbol.iterator]();
                let next = iter.next();
            "#}),
        TestAction::assert_eq("next.value", JsValue::undefined()),
        TestAction::assert("next.done"),
    ]);
}

#[test]
fn ascii_iter() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    Array.from(new String("Hello World")[Symbol.iterator]()),
                    ["H", "e", "l", "l", "o", " ", "W", "o", "r", "l", "d"]
                )
            "#}),
    ]);
}

#[test]
fn unicode_iter() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert(indoc! {r#"
                arrayEquals(
                    Array.from(new String("C🙂🙂l W🙂rld")[Symbol.iterator]()),
                    ["C", "🙂", "🙂", "l", " ", "W", "🙂", "r", "l", "d"]
                )
            "#}),
    ]);
}

#[test]
fn string_get_property() {
    run_test_actions([
        TestAction::assert_eq("'abc'[-1]", JsValue::undefined()),
        TestAction::assert_eq("'abc'[1]", js_str!("b")),
        TestAction::assert_eq("'abc'[2]", js_str!("c")),
        TestAction::assert_eq("'abc'[3]", JsValue::undefined()),
        TestAction::assert_eq("'abc'['foo']", JsValue::undefined()),
        TestAction::assert_eq("'😀'[0]", js_string!(&[0xD83D])),
    ]);
}

#[test]
fn search() {
    run_test_actions([
        TestAction::assert_eq("'aa'.search(/b/)", -1),
        TestAction::assert_eq("'aa'.search(/a/)", 0),
        TestAction::assert_eq("'aa'.search(/a/g)", 0),
        TestAction::assert_eq("'ba'.search(/a/)", 1),
    ]);
}

#[test]
fn from_code_point() {
    // Taken from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/fromCodePoint
    run_test_actions([
        TestAction::assert_eq("String.fromCodePoint(42)", js_str!("*")),
        TestAction::assert_eq("String.fromCodePoint(65, 90)", js_str!("AZ")),
        TestAction::assert_eq("String.fromCodePoint(0x404)", js_str!("Є")),
        TestAction::assert_eq(
            "String.fromCodePoint(0x2f804)",
            js_string!(&[0xD87E, 0xDC04]),
        ),
        TestAction::assert_eq(
            "String.fromCodePoint(0x1D306, 0x1D307)",
            js_string!(&[0xD834, 0xDF06, 0xD834, 0xDF07]),
        ),
        // Should encode to unpaired surrogates
        TestAction::assert_eq(
            "String.fromCharCode(0xD800, 0xD8FF)",
            js_string!(&[0xD800, 0xD8FF]),
        ),
        TestAction::assert_eq(
            "String.fromCodePoint(9731, 9733, 9842, 0x4F60)",
            js_str!("☃★♲你"),
        ),
        TestAction::assert_native_error(
            "String.fromCodePoint('_')",
            JsNativeErrorKind::Range,
            "codepoint `NaN` is not an integer",
        ),
        TestAction::assert_native_error(
            "String.fromCodePoint(Infinity)",
            JsNativeErrorKind::Range,
            "codepoint `inf` is not an integer",
        ),
        TestAction::assert_native_error(
            "String.fromCodePoint(-1)",
            JsNativeErrorKind::Range,
            "codepoint `-1` outside of Unicode range",
        ),
        TestAction::assert_native_error(
            "String.fromCodePoint(3.14)",
            JsNativeErrorKind::Range,
            "codepoint `3.14` is not an integer",
        ),
        TestAction::assert_native_error(
            "String.fromCodePoint(3e-2)",
            JsNativeErrorKind::Range,
            "codepoint `0.03` is not an integer",
        ),
        TestAction::assert_native_error(
            "String.fromCodePoint(NaN)",
            JsNativeErrorKind::Range,
            "codepoint `NaN` is not an integer",
        ),
    ]);
}

#[test]
fn match_with_symbol_match_method() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
                const obj = {
                  [Symbol.match](str) {
                    return ["custom", str];
                  }
                };
                "abc".match(obj)[0]
            "#},
        js_str!("custom"),
    )]);
}

#[test]
fn match_with_overridden_exec() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
                let r = /a/;
                r.exec = () => ["fake"];
                "abc".match(r)[0]
            "#},
        js_str!("fake"),
    )]);
}
