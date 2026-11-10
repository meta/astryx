use crate::parser::tests::format::test_formatting;

#[test]
fn new() {
    test_formatting(
        r#"
        function MyClass() {}
        let inst = new MyClass();
        "#,
    );
}

#[test]
fn call() {
    test_formatting(
        r#"
        call_1(1, 2, 3);
        call_2("argument here");
        call_3();
        "#,
    );
}

#[test]
fn assign() {
    test_formatting(
        r#"
        let a = 20;
        a += 10;
        a -= 10;
        a *= 10;
        a **= 10;
        a /= 10;
        a %= 10;
        a &= 10;
        a |= 10;
        a ^= 10;
        a <<= 10;
        a >>= 10;
        a >>>= 10;
        a &&= 10;
        a ||= 10;
        a ??= 10;
        a;
        "#,
    );
}

#[test]
fn spread() {
    test_formatting(
        r#"
        function f(m) {
            return m;
        }
        function g(...args) {
            return f(...args);
        }
        let a = g("message");
        a;
        "#,
    );
}

#[test]
fn r#await() {
    // TODO: `let a = await fn()` is invalid syntax as of writing. It should be tested here once implemented.
    test_formatting(
        r#"
            async function f() {
                await function_call();
            }
            "#,
    );
}

#[test]
fn array() {
    test_formatting(
        r#"
            let a = [1, 2, 3, "words", "more words"];
            let b = [];
            "#,
    );
}

#[test]
fn template() {
    test_formatting(
        r"
        function tag(t, ...args) {
            let a = [];
            a = a.concat([t[0], t[1], t[2]]);
            a = a.concat([t.raw[0], t.raw[1], t.raw[2]]);
            a = a.concat([args[0], args[1]]);
            return a;
        }
        let a = 10;
        tag`result: ${a} \x26 ${a + 10}`;
        ",
    );
}

#[test]
fn object() {
    test_formatting(
        r#"
        let other = {
            c: 10,
        };
        let inst = {
            val: 5,
            b: "hello world",
            nested: {
                a: 5,
                b: 6,
            },
            ...other,
            say_hi: function() {
                console.log("hello!");
            },
            get a() {
                return this.val + 1;
            },
            set a(new_value) {
                this.val = new_value;
            },
            say_hello(msg) {
                console.log("hello " + msg);
            },
        };
        inst.a = 20;
        inst.a;
        inst.say_hello("humans");
        "#,
    );
}

#[test]
fn array_literal_empty() {
    test_formatting(
        r"
        [];
        ",
    );
}

#[test]
fn array_literal_values() {
    test_formatting(
        r#"
        [0, 1, "a", this, null, undefined, true, false];
        "#,
    );
}

#[test]
fn array_literal_elision() {
    test_formatting(
        r"
        [, , ,];
        ",
    );
}

#[test]
fn array_literal_elision_values() {
    test_formatting(
        r"
        [1, 2, , 3, 4];
        ",
    );
}

#[test]
fn array_literal_elision_start_end() {
    test_formatting(
        r"
        [, , 1, 2, , 3, 4, ,];
        ",
    );
}
