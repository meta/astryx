#![cfg(any(not(feature = "intl"), feature = "intl_bundled"))]

use boa_macros::js_str;
use indoc::indoc;

mod async_generator;
mod class;
mod control_flow;
mod env;
mod function;
mod generators;
mod iterators;
mod job;
mod operators;
mod promise;
mod spread;
mod to_string;

use crate::{JsNativeErrorKind, JsValue, TestAction, run_test_actions};

#[test]
fn length_correct_value_on_string_literal() {
    run_test_actions([TestAction::assert_eq("'hello'.length", 5)]);
}

#[test]
fn empty_let_decl_undefined() {
    run_test_actions([TestAction::assert_eq("let a; a", JsValue::undefined())]);
}

#[test]
fn semicolon_expression_stop() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            var a = 1;
            + 1;
            a
        "#},
        1,
    )]);
}

#[test]
fn empty_var_decl_undefined() {
    run_test_actions([TestAction::assert_eq("var a; a", JsValue::undefined())]);
}

#[test]
fn identifier_on_global_object_undefined() {
    run_test_actions([TestAction::assert_native_error(
        "bar;",
        JsNativeErrorKind::Reference,
        "bar is not defined",
    )]);
}

#[test]
fn object_field_set() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let m = {};
            m['key'] = 22;
            m['key']
        "#},
        22,
    )]);
}

#[test]
fn array_field_set() {
    run_test_actions([
        TestAction::run("let m;"),
        // element_changes
        TestAction::assert_eq(
            indoc! {r#"
                m = [1, 2, 3];
                m[1] = 5;
                m[1]
            "#},
            5,
        ),
        // length changes
        TestAction::assert_eq(
            indoc! {r#"
                m = [1, 2, 3];
                m[10] = 52;
                m.length
            "#},
            11,
        ),
        // negative_index_wont_affect_length
        TestAction::assert_eq(
            indoc! {r#"
                m = [1, 2, 3];
                m[-11] = 5;
                m.length
            "#},
            3,
        ),
        // non_num_key_wont_affect_length
        TestAction::assert_eq(
            indoc! {r#"
                m = [1, 2, 3];
                m["magic"] = 5;
                m.length
            "#},
            3,
        ),
    ]);
}

#[test]
fn var_decl_hoisting_simple() {
    run_test_actions([TestAction::assert_eq("x = 5; var x; x", 5)]);
}

#[test]
fn var_decl_hoisting_with_initialization() {
    run_test_actions([TestAction::assert_eq("x = 5; var x = 10; x", 10)]);
}

#[test]
fn var_decl_hoisting_2_variables_hoisting() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            x = y;

            var x = 10;
            var y = 5;

            x;
        "#},
        10,
    )]);
}

#[test]
fn var_decl_hoisting_2_variables_hoisting_2() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            var x = y;

            var y = 5;
            x;
        "#},
        JsValue::undefined(),
    )]);
}

#[test]
fn var_decl_hoisting_2_variables_hoisting_3() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let y = x;
            x = 5;

            var x = 10;
            y;
        "#},
        JsValue::undefined(),
    )]);
}

#[test]
fn function_decl_hoisting() {
    run_test_actions([
        TestAction::assert_eq(
            indoc! {r#"
                {
                    let a = hello();
                    function hello() { return 5 }

                    a;
                }
            "#},
            5,
        ),
        TestAction::assert_eq(
            indoc! {r#"
                {
                    x = hello();

                    function hello() { return 5 }
                    var x;
                    x;
                }
            "#},
            5,
        ),
        TestAction::assert_eq(
            indoc! {r#"
                {
                    hello = function() { return 5 }
                    x = hello();

                    x;
                }
            "#},
            5,
        ),
        TestAction::assert_eq(
            indoc! {r#"
                {
                    let x = b();

                    function a() {return 5}
                    function b() {return a()}

                    x;
                }
            "#},
            5,
        ),
        TestAction::assert_eq(
            indoc! {r#"
                {
                    let x = b();

                    function b() {return a()}
                    function a() {return 5}

                    x;
                }
            "#},
            5,
        ),
    ]);
}

#[test]
fn check_this_binding_in_object_literal() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            var foo = {
                a: 3,
                bar: function () { return this.a + 5 }
            };

            foo.bar()
        "#},
        8,
    )]);
}

#[test]
fn array_creation_benchmark() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert(indoc! {r#"
                const finalArr = [ "p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10",
                "p11", "p12", "p13", "p14", "p15", "p16", "p17", "p18", "p19", "p20",
                "p21", "p22", "p23", "p24", "p25", "p26", "p27", "p28", "p29", "p30",
                "p31", "p32", "p33", "p34", "p35", "p36", "p37", "p38", "p39", "p40",
                "p41", "p42", "p43", "p44", "p45", "p46", "p47", "p48", "p49", "p50",
                "p51", "p52", "p53", "p54", "p55", "p56", "p57", "p58", "p59", "p60",
                "p61", "p62", "p63", "p64", "p65", "p66", "p67", "p68", "p69", "p70",
                "p71", "p72", "p73", "p74", "p75", "p76", "p77", "p78", "p79", "p80",
                "p81", "p82", "p83", "p84", "p85", "p86", "p87", "p88", "p89", "p90",
                "p91", "p92", "p93", "p94", "p95", "p96", "p97", "p98", "p99", "p100",
                "p101", "p102", "p103", "p104", "p105", "p106", "p107", "p108", "p109", "p110",
                "p111", "p112", "p113", "p114", "p115", "p116", "p117", "p118", "p119", "p120",
                "p121", "p122", "p123", "p124", "p125", "p126", "p127", "p128", "p129", "p130",
                "p131", "p132", "p133", "p134", "p135", "p136", "p137", "p138", "p139", "p140",
                "p141", "p142", "p143", "p144", "p145", "p146", "p147", "p148", "p149", "p150",
                "p151", "p152", "p153", "p154", "p155", "p156", "p157", "p158", "p159", "p160",
                "p161", "p162", "p163", "p164", "p165", "p166", "p167", "p168", "p169", "p170",
                "p171", "p172", "p173", "p174", "p175", "p176", "p177", "p178", "p179", "p180",
                "p181", "p182", "p183", "p184", "p185", "p186", "p187", "p188", "p189", "p190",
                "p191", "p192", "p193", "p194", "p195", "p196", "p197", "p198", "p199", "p200",
                "p201", "p202", "p203", "p204", "p205", "p206", "p207", "p208", "p209", "p210",
                "p211", "p212", "p213", "p214", "p215", "p216", "p217", "p218", "p219", "p220",
                "p221", "p222", "p223", "p224", "p225", "p226", "p227", "p228", "p229", "p230",
                "p231", "p232", "p233", "p234", "p235", "p236", "p237", "p238", "p239", "p240",
                "p241", "p242", "p243", "p244", "p245", "p246", "p247", "p248", "p249", "p250",
                "p251", "p252", "p253", "p254", "p255", "p256", "p257", "p258", "p259", "p260",
                "p261", "p262", "p263", "p264", "p265", "p266", "p267", "p268", "p269", "p270",
                "p271", "p272", "p273", "p274", "p275", "p276", "p277", "p278", "p279", "p280",
                "p281", "p282", "p283", "p284", "p285", "p286", "p287", "p288", "p289", "p290",
                "p291", "p292", "p293", "p294", "p295", "p296", "p297", "p298", "p299", "p300",
                "p301", "p302", "p303", "p304", "p305", "p306", "p307", "p308", "p309", "p310",
                "p311", "p312", "p313", "p314", "p315", "p316", "p317", "p318", "p319", "p320",
                "p321", "p322", "p323", "p324", "p325", "p326", "p327", "p328", "p329", "p330",
                "p331", "p332", "p333", "p334", "p335", "p336", "p337", "p338", "p339", "p340",
                "p341", "p342", "p343", "p344", "p345", "p346", "p347", "p348", "p349", "p350",
                "p351", "p352", "p353", "p354", "p355", "p356", "p357", "p358", "p359", "p360",
                "p361", "p362", "p363", "p364", "p365", "p366", "p367", "p368", "p369", "p370",
                "p371", "p372", "p373", "p374", "p375", "p376", "p377", "p378", "p379", "p380",
                "p381", "p382", "p383", "p384", "p385", "p386", "p387", "p388", "p389", "p390",
                "p391", "p392", "p393", "p394", "p395", "p396", "p397", "p398", "p399", "p400",
                "p401", "p402", "p403", "p404", "p405", "p406", "p407", "p408", "p409", "p410",
                "p411", "p412", "p413", "p414", "p415", "p416", "p417", "p418", "p419", "p420",
                "p421", "p422", "p423", "p424", "p425", "p426", "p427", "p428", "p429", "p430",
                "p431", "p432", "p433", "p434", "p435", "p436", "p437", "p438", "p439", "p440",
                "p441", "p442", "p443", "p444", "p445", "p446", "p447", "p448", "p449", "p450",
                "p451", "p452", "p453", "p454", "p455", "p456", "p457", "p458", "p459", "p460",
                "p461", "p462", "p463", "p464", "p465", "p466", "p467", "p468", "p469", "p470",
                "p471", "p472", "p473", "p474", "p475", "p476", "p477", "p478", "p479", "p480",
                "p481", "p482", "p483", "p484", "p485", "p486", "p487", "p488", "p489", "p490",
                "p491", "p492", "p493", "p494", "p495", "p496", "p497", "p498", "p499", "p500" ];

                let testArr = [];
                for (let a = 0; a <= 500; a++) {
                    testArr[a] = ('p' + a);
                }

                arrayEquals(testArr, finalArr)
            "#}),
    ]);
}

#[test]
fn array_pop_benchmark() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert(indoc! {r#"
            let testArray = [83, 93, 27, 29, 2828, 234, 23, 56, 32, 56, 67, 77, 32,
            45, 93, 17, 28, 83, 62, 99, 36, 28, 93, 27, 29, 2828,
            234, 23, 56, 32, 56, 67, 77, 32, 45, 93, 17, 28, 83, 62,
            99, 36, 28, 93, 27, 29, 2828, 234, 23, 56, 32, 56, 67,
            77, 32, 45, 93, 17, 28, 83, 62, 99, 36, 28, 93, 27, 29,
            2828, 234, 23, 56, 32, 56, 67, 77, 32, 45, 93, 17, 28,
            83, 62, 99, 36, 28, 93, 27, 29, 2828, 234, 23, 56, 32,
            56, 67, 77, 32, 45, 93, 17, 28, 83, 62, 99, 36, 28, 93,
            27, 29, 2828, 234, 23, 56, 32, 56, 67, 77, 32, 45, 93,
            17, 28, 83, 62, 99, 36, 28, 93, 27, 29, 2828, 234, 23,
            56, 32, 56, 67, 77, 32, 45, 93, 17, 28, 83, 62, 99, 36,
            28, 93, 27, 29, 2828, 234, 23, 56, 32, 56, 67, 77, 32,
            45, 93, 17, 28, 83, 62, 99, 36, 28, 93, 27, 29, 2828, 234,
            23, 56, 32, 56, 67, 77, 32, 45, 93, 17, 28, 83, 62, 99,
            36, 28, 93, 27, 29, 2828, 234, 23, 56, 32, 56, 67, 77, 32,
            45, 93, 17, 28, 83, 62, 99, 36, 28];

            while (testArray.length > 0) {
                testArray.pop();
            }

            arrayEquals(testArray, [])
            "#}),
    ]);
}

#[test]
fn number_object_access_benchmark() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            new Number(
                new Number(
                    new Number(
                        new Number(100).valueOf() - 10.5
                    ).valueOf() + 100
                ).valueOf() * 1.6
            ).valueOf()
        "#},
        303.2,
    )]);
}

#[test]
fn multiline_str_concat() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 'hello ' +
                    'world';
            a
        "#},
        js_str!("hello world"),
    )]);
}

#[test]
fn result_of_empty_block() {
    run_test_actions([TestAction::assert_eq("{}", JsValue::undefined())]);
}

#[test]
fn undefined_constant() {
    run_test_actions([TestAction::assert_eq("undefined", JsValue::undefined())]);
}

#[test]
fn identifier_op() {
    run_test_actions([TestAction::assert_native_error(
        "break = 1",
        JsNativeErrorKind::Syntax,
        r#"expected token 'identifier', got '=' in identifier parsing at line 1, col 7"#,
    )]);
}

#[test]
fn strict_mode_octal() {
    // Checks as per https://tc39.es/ecma262/#sec-literals-numeric-literals that 0 prefix
    // octal number literal syntax is a syntax error in strict mode.
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            'use strict';
            var n = 023;
        "#},
        JsNativeErrorKind::Syntax,
        "implicit octal literals are not allowed in strict mode at line 2, col 9",
    )]);
}

#[test]
fn strict_mode_with() {
    // Checks as per https://tc39.es/ecma262/#sec-with-statement-static-semantics-early-errors
    // that a with statement is an error in strict mode code.
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            'use strict';
            function f(x, o) {
                with (o) {
                    console.log(x);
                }
            }
        "#},
        JsNativeErrorKind::Syntax,
        "with statement not allowed in strict mode at line 3, col 5",
    )]);
}

#[test]
fn strict_mode_reserved_name() {
    // Checks that usage of a reserved keyword for an identifier name is
    // an error in strict mode code as per https://tc39.es/ecma262/#sec-strict-mode-of-ecmascript.

    let cases = [
        (
            "var implements = 10;",
            "unexpected token 'implements', strict reserved word cannot be an identifier at line 1, col 19",
        ),
        (
            "var interface = 10;",
            "unexpected token 'interface', strict reserved word cannot be an identifier at line 1, col 19",
        ),
        (
            "var package = 10;",
            "unexpected token 'package', strict reserved word cannot be an identifier at line 1, col 19",
        ),
        (
            "var private = 10;",
            "unexpected token 'private', strict reserved word cannot be an identifier at line 1, col 19",
        ),
        (
            "var protected = 10;",
            "unexpected token 'protected', strict reserved word cannot be an identifier at line 1, col 19",
        ),
        (
            "var public = 10;",
            "unexpected token 'public', strict reserved word cannot be an identifier at line 1, col 19",
        ),
        (
            "var static = 10;",
            "unexpected token 'static', strict reserved word cannot be an identifier at line 1, col 19",
        ),
        (
            "var eval = 10;",
            "binding identifier `eval` not allowed in strict mode at line 1, col 19",
        ),
        (
            "var arguments = 10;",
            "binding identifier `arguments` not allowed in strict mode at line 1, col 19",
        ),
        (
            "var let = 10;",
            "unexpected token 'let', strict reserved word cannot be an identifier at line 1, col 19",
        ),
        (
            "var yield = 10;",
            "unexpected token 'yield', strict reserved word cannot be an identifier at line 1, col 19",
        ),
    ];

    run_test_actions(cases.into_iter().map(|(case, msg)| {
        TestAction::assert_native_error(
            format!("'use strict'; {case}"),
            JsNativeErrorKind::Syntax,
            msg,
        )
    }));
}

#[test]
fn issue5357() {
    run_test_actions([TestAction::assert_native_error(
        "foo(); @",
        JsNativeErrorKind::Syntax,
        "unexpected '@' at line 1, col 8",
    )]);
}

#[test]
fn empty_statement() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            ;;;let a = 10;;
            if(a) ;
            a
        "#},
        10,
    )]);
}

#[test]
fn tagged_template() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::assert(indoc! {r#"
                function tag(t, ...args) {
                    let a = []
                    a = a.concat([t[0], t[1], t[2]]);
                    a = a.concat([t.raw[0], t.raw[1], t.raw[2]]);
                    a = a.concat([args[0], args[1]]);
                    return a
                }
                let a = 10;

                arrayEquals(
                    tag`result: ${a} \x26 ${a+10}`,
                    [ "result: ", " & ", "", "result: ", " \\x26 ", "", 10, 20 ]
                )
            "#}),
    ]);
}

#[test]
fn template_literal() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 10;
            `result: ${a} and ${a+10}`;
        "#},
        js_str!("result: 10 and 20"),
    )]);
}

#[test]
fn null_bool_in_object_pattern() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            let obj = {
                null: 0,
                true: 10,
                false: 100
            };

            let { null: a, true: b, false: c } = obj;
        "#}),
        TestAction::assert_eq("a", 0),
        TestAction::assert_eq("b", 10),
        TestAction::assert_eq("c", 100),
    ]);
}

// https://github.com/boa-dev/boa/pull/4372
#[test]
fn fix_index_access_in_finally_jump_table_in_loop() {
    run_test_actions([
        TestAction::run(indoc! {r#"
        do {
            try {
                throw 0; // can be any values

                // This is unreachable, but it forces creation of HandleFinally jump record.
                break;
            } catch {
                // It is important that we enter the finally with rethrow flag set to false,
                // we do this by just catching the value and ignoring it.
            } finally {
                // The index register is released right after allocation, so we can override it
                // by allocating the next register through an expression statement.
                "this is used as the index, which triggers unreachable code in JumpTable"
            }
        } while (0);
    "#}),
        TestAction::run(indoc! {r#"
        do {
            try {
                throw 0; // can be any values

                // This is unreachable, but it forces creation of HandleFinally jump record.
                continue;
            } catch {
                // It is important that we enter the finally with rethrow flag set to false,
                // we do this by just catching the value and ignoring it.
            } finally {
                // The index register is released right after allocation, so we can override it
                // by allocating the next register through an expression statement.
                "this is used as the index, which triggers unreachable code in JumpTable"
            }
        } while (0);
    "#}),
    ]);
}

// https://github.com/boa-dev/boa/pull/4372
#[test]
fn fix_index_access_in_finally_jump_table_in_function() {
    run_test_actions([TestAction::run(indoc! {r#"
        (() => {
            try {
                throw 0; // can be any values

                // This is unreachable, but it forces creation of HandleFinally jump record.
                return;
            } catch {
                // It is important that we enter the finally with rethrow flag set to false,
                // we do this by just catching the value and ignoring it.
            } finally {
                // The index register is released right after allocation, so we can override it
                // by allocating the next register through an expression statement.
                "this is used as the index, which triggers unreachable code in JumpTable"
            }
        })()
    "#})]);
}
