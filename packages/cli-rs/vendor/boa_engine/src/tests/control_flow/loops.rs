use crate::{JsNativeErrorKind, TestAction, run_test_actions};
use boa_macros::js_str;
use indoc::indoc;

#[test]
fn do_while_loop() {
    run_test_actions([
        TestAction::assert_eq(
            indoc! {r#"
                a = 0;
                do {
                    a += 1;
                } while (a < 10);
                a
            "#},
            10,
        ),
        TestAction::assert_eq(
            indoc! {r#"
                pow = 0;
                b = 1;
                do {
                    pow += 1;
                    b *= 2;
                } while (pow < 8);
                b
            "#},
            256,
        ),
    ]);
}

#[test]
fn do_while_loop_at_least_once() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            a = 0;
            do
            {
                a += 1;
            }
            while (false);
            a
        "#},
        1,
    )]);
}

#[test]
fn do_while_post_inc() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            var i = 0;
            do {} while(i++ < 10) i;
        "#},
        11,
    )]);
}

#[test]
fn do_while_in_block() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            {
                var i = 0;
                do {
                    i += 1;
                }
                while(false);
                i;
            }
        "#},
        1,
    )]);
}

#[test]
fn for_loop() {
    run_test_actions([
        TestAction::assert_eq(
            indoc! {r#"
                {
                    const a = ['h', 'e', 'l', 'l', 'o'];
                    let b = '';
                    for (let i = 0; i < a.length; i++) {
                        b = b + a[i];
                    }
                    b
                }
            "#},
            js_str!("hello"),
        ),
        TestAction::assert_eq(
            indoc! {r#"
                {
                    let a = 0;
                    let i = 0;
                    for (;i < 10;) {
                        a = a + i;
                        i++;
                    }
                    a
                }
            "#},
            45,
        ),
        TestAction::assert_eq(
            indoc! {r#"
                {
                    let a = 0
                    for (;false;) {
                        a++;
                    }
                    a
                }
            "#},
            0,
        ),
    ]);
}

#[test]
fn for_loop_iteration_variable_does_not_leak() {
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            for (let i = 0;false;) {}
            i
        "#},
        JsNativeErrorKind::Reference,
        "i is not defined",
    )]);
}

#[test]
fn test_invalid_break_target() {
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            while (false) {
                break nonexistent;
            }
        "#},
        JsNativeErrorKind::Syntax,
        "undefined break target: nonexistent at line 1, col 1",
    )]);
}

#[test]
fn try_break_finally_edge_cases() {
    let scenario = r#"
        var a;
        var b;
        {
            while (true) {
                try {
                    try {
                        break;
                    } catch(a) {
                    } finally {
                    }
                } finally {
                }
            }
        }

        {
            while (true) {
                try {
                    try {
                        throw "b";
                    } catch (b) {
                        break;
                    } finally {
                        a = "foo"
                    }
                } finally {
                }
            }
        }

        {
            while (true) {
                try {
                    try {
                    } catch (c) {
                    } finally {
                        b = "bar"
                        break;
                    }
                } finally {
                }
            }
        }
        a + b
    "#;

    run_test_actions([TestAction::assert_eq(scenario, js_str!("foobar"))]);
}

#[test]
fn try_break_labels() {
    let scenario = r#"
        {
            var str = '';

            outer: {
                foo: {
                    bar: {
                        while (true) {
                            try {
                                try {
                                    break;
                                } catch(f) {
                                } finally {
                                    str = "fin";
                                    break foo;
                                    str += "This won't execute";
                                }
                            } finally {
                                str = str + "ally!"
                                break bar;
                            }
                        }
                        str += " oh no";
                    }
                    str += " :)";
                }
            }
            str
        }
    "#;

    run_test_actions([TestAction::assert_eq(scenario, js_str!("finally! :)"))]);
}

#[test]
fn break_nested_labels_loops_and_try() {
    let scenario = r#"
        function nestedLabels(x) {
            let str = "";
            foo: {
                spacer: {
                    bar: {
                        while(true) {
                            try {
                                try {
                                    break spacer;
                                } finally {
                                    str = "foo";
                                }
                            } catch(h) {} finally {
                                str += "bar"
                                if (x === true) {
                                    break foo;
                                } else {
                                    break bar;
                                }
                            }
                        }
                        str += " broke-while"
                    }
                    str += " broke-bar"
                }
                str += " broke-spacer"
            }
            str += " broke-foo";
            return str
        }
    "#;

    run_test_actions([
        TestAction::run(scenario),
        TestAction::assert_eq("nestedLabels(true)", js_str!("foobar broke-foo")),
        TestAction::assert_eq(
            "nestedLabels(false)",
            js_str!("foobar broke-bar broke-spacer broke-foo"),
        ),
    ]);
}

#[test]
fn break_environment_gauntlet() {
    // test that break handles popping environments correctly.
    let scenario = r#"
        let a = 0;

        while(true) {
            break;
        }

        while(true) break

        do {break} while(true);

        while (a < 3) {
            let a = 1;
            if (a == 1) {
                break;
            }

            let b = 2;
        }

        {
            b = 0;
            do {
                b = 2
                if (b == 2) {
                    break;
                }
                b++
            } while( i < 3);

            let c = 1;
        }

        {
            for (let r = 0; r< 3; r++) {
                if (r == 2) {
                    break;
                }
            }
        }

        basic: for (let a = 0; a < 2; a++) {
            break;
        }

        {
            let result = true;
            {
                let x = 2;
                L: {
                    let x = 3;
                    result &&= (x === 3);
                    break L;
                    result &&= (false);
                }
                result &&= (x === 2);
            }
            result;
        }

        {
            var str = "";

            far_outer: {
                outer: for (let i = 0; i < 5; i++) {
                    inner: for (let b = 5; b < 10; b++) {
                        if (b === 7) {
                            break far_outer;
                        }
                        str = str + b;
                    }
                    str = str + i;
                }
            }
            str
        }

        {
            for (let r = 0; r < 2; r++) {
                str = str + r
            }
        }

        {
            let result = "";
            lab_block: {
                try {
                    result = "try_block";
                    break lab_block;
                    result = "did not break"
                } catch (err) {}
            }
            str = str + result
            str
        }
    "#;

    run_test_actions([TestAction::assert_eq(scenario, js_str!("5601try_block"))]);
}

#[test]
fn while_loop_late_break() {
    // Ordering with statement before the break.
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 1;
            while (a < 5) {
                a++;
                if (a == 3) {
                    break;
                }
            }
            a;
        "#},
        3,
    )]);
}

#[test]
fn while_loop_early_break() {
    // Ordering with statements after the break.
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 1;
            while (a < 5) {
                if (a == 3) {
                    break;
                }
                a++;
            }
            a;
        "#},
        3,
    )]);
}

#[test]
fn for_loop_break() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 1;
            for (; a < 5; a++) {
                if (a == 3) {
                    break;
                }
            }
            a;
        "#},
        3,
    )]);
}

#[test]
fn for_loop_return() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            function foo() {
                for (let a = 1; a < 5; a++) {
                    if (a == 3) {
                        return a;
                    }
                }
            }
            foo();
        "#},
        3,
    )]);
}

#[test]
fn do_loop_late_break() {
    // Ordering with statement before the break.
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 1;
            do {
                a++;
                if (a == 3) {
                    break;
                }
            } while (a < 5);
            a;
        "#},
        3,
    )]);
}

#[test]
fn do_loop_early_break() {
    // Ordering with statements after the break.
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 1;
            do {
                if (a == 3) {
                    break;
                }
                a++;
            } while (a < 5);
            a;
        "#},
        3,
    )]);
}

#[test]
fn break_out_of_inner_loop() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var a = 0, b = 0;
                for (let i = 0; i < 2; i++) {
                    a++;
                    for (let j = 0; j < 10; j++) {
                        b++;
                        if (j == 3)
                            break;
                    }
                    a++;
                }
            "#}),
        TestAction::assert_eq("a", 4),
        TestAction::assert_eq("b", 8),
    ]);
}

#[test]
fn continue_inner_loop() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var a = 0, b = 0;
                for (let i = 0; i < 2; i++) {
                    a++;
                    for (let j = 0; j < 10; j++) {
                        if (j < 3)
                            continue;
                        b++;
                    }
                    a++;
                }
            "#}),
        TestAction::assert_eq("a", 4),
        TestAction::assert_eq("b", 14),
    ]);
}

#[test]
fn for_loop_continue_out_of_switch() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var a = 0, b = 0, c = 0;
                for (let i = 0; i < 3; i++) {
                    a++;
                    switch (i) {
                        case 0:
                            continue;
                            c++;
                        case 1:
                            continue;
                        case 5:
                            c++;
                    }
                    b++;
                }
            "#}),
        TestAction::assert_eq("a", 3),
        TestAction::assert_eq("b", 1),
        TestAction::assert_eq("c", 0),
    ]);
}

#[test]
fn while_loop_continue() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var i = 0, a = 0, b = 0;
                while (i < 3) {
                    i++;
                    if (i < 2) {
                        a++;
                        continue;
                    }
                    b++;
                }
            "#}),
        TestAction::assert_eq("a", 1),
        TestAction::assert_eq("b", 2),
    ]);
}

#[test]
fn do_while_loop_continue() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var i = 0, a = 0, b = 0;
                do {
                    i++;
                    if (i < 2) {
                        a++;
                        continue;
                    }
                    b++;
                } while (i < 3)
            "#}),
        TestAction::assert_eq("a", 1),
        TestAction::assert_eq("b", 2),
    ]);
}

#[test]
fn for_of_loop_declaration() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var result = 0;
                for (i of [1, 2, 3]) {
                    result = i;
                }
            "#}),
        TestAction::assert_eq("result", 3),
        TestAction::assert_eq("i", 3),
    ]);
}

#[test]
fn for_of_loop_var() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var result = 0;
                for (var i of [1, 2, 3]) {
                    result = i;
                }
            "#}),
        TestAction::assert_eq("result", 3),
        TestAction::assert_eq("i", 3),
    ]);
}

#[test]
fn for_of_loop_let() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var result = 0;
                for (let i of [1, 2, 3]) {
                    result = i;
                }
            "#}),
        TestAction::assert_eq("result", 3),
        TestAction::assert_native_error("i", JsNativeErrorKind::Reference, "i is not defined"),
    ]);
}

#[test]
fn for_of_loop_const() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var result = 0;
                for (let i of [1, 2, 3]) {
                    result = i;
                }
            "#}),
        TestAction::assert_eq("result", 3),
        TestAction::assert_native_error("i", JsNativeErrorKind::Reference, "i is not defined"),
    ]);
}

#[test]
fn for_of_loop_break() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var result = 0;
                for (var i of [1, 2, 3]) {
                    if (i > 1)
                        break;
                    result = i
                }
            "#}),
        TestAction::assert_eq("result", 1),
        TestAction::assert_eq("i", 2),
    ]);
}

#[test]
fn for_of_loop_continue() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                var result = 0;
                for (var i of [1, 2, 3]) {
                    if (i == 3)
                        continue;
                    result = i
                }
            "#}),
        TestAction::assert_eq("result", 2),
        TestAction::assert_eq("i", 3),
    ]);
}

#[test]
fn for_of_loop_return() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                function foo() {
                    for (i of [1, 2, 3]) {
                        if (i > 1)
                            return i;
                    }
                }
            "#}),
        TestAction::assert_eq("foo()", 2),
    ]);
}

#[test]
fn for_loop_break_label() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            var str = "";

            outer: for (let i = 0; i < 5; i++) {
                inner: for (let b = 0; b < 5; b++) {
                    if (b === 2) {
                    break outer;
                    }
                    str = str + b;
                }
                str = str + i;
            }
            str
        "#},
        js_str!("01"),
    )]);
}

#[test]
fn for_loop_continue_label() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            var count = 0;
            label: for (let x = 0; x < 10;) {
                while (true) {
                    x++;
                    count++;
                    continue label;
                }
            }
            count
        "#},
        10,
    )]);
}

#[test]
fn for_in_declaration() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run(indoc! {r#"
                let result = [];
                let obj = { a: "a", b: 2};
                var i;
                for (i in obj) {
                    result = result.concat([i]);
                }
            "#}),
        TestAction::assert("arrayEquals(result, ['a', 'b'])"),
    ]);
}

#[test]
fn for_in_var_object() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run(indoc! {r#"
                let result = [];
                let obj = { a: "a", b: 2};
                for (var i in obj) {
                    result = result.concat([i]);
                }
            "#}),
        TestAction::assert("arrayEquals(result, ['a', 'b'])"),
    ]);
}

#[test]
fn for_in_var_array() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run(indoc! {r#"
                let result = [];
                let arr = ["a", "b"];
                for (var i in arr) {
                    result = result.concat([i]);
                }
            "#}),
        TestAction::assert("arrayEquals(result, ['0', '1'])"),
    ]);
}

#[test]
fn for_in_let_object() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run(indoc! {r#"
                let result = [];
                let obj = { a: "a", b: 2};
                for (let i in obj) {
                    result = result.concat([i]);
                }
            "#}),
        TestAction::assert("arrayEquals(result, ['a', 'b'])"),
    ]);
}

#[test]
fn for_in_const_array() {
    run_test_actions([
        TestAction::run_harness(),
        TestAction::run(indoc! {r#"
                let result = [];
                let arr = ["a", "b"];
                for (const i in arr) {
                    result = result.concat([i]);
                }
            "#}),
        TestAction::assert("arrayEquals(result, ['0', '1'])"),
    ]);
}

#[test]
fn for_in_break_label() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            var str = "";

            outer: for (let i in [1, 2]) {
                inner: for (let b in [2, 3, 4]) {
                    if (b === "1") {
                        break outer;
                    }
                    str = str + b;
                }
                str = str + i;
            }
            str
        "#},
        js_str!("0"),
    )]);
}

#[test]
fn for_in_continue_label() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            var str = "";

            outer: for (let i in [1, 2]) {
                inner: for (let b in [2, 3, 4]) {
                    if (b === "1") {
                        continue outer;
                    }
                    str = str + b;
                }
                str = str + i;
            }
            str
        "#},
        js_str!("00"),
    )]);
}
