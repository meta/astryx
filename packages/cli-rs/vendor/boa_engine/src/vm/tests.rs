use crate::error::RuntimeLimitError;
use crate::vm::CallFrame;
use crate::vm::call_frame::CallFrameLocation;
use crate::vm::source_info::SourcePath;
use crate::{
    Context, JsNativeErrorKind, JsValue, NativeFunction, TestAction, js_string,
    property::Attribute, run_test_actions, run_test_actions_with,
};
use boa_ast::Position;
use boa_macros::js_str;
use boa_parser::Source;
use indoc::indoc;

#[test]
fn typeof_string() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            const a = "hello";
            typeof a;
        "#},
        js_str!("string"),
    )]);
}

#[test]
fn typeof_number() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let a = 1234;
            typeof a;
        "#},
        js_str!("number"),
    )]);
}

#[test]
fn basic_op() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            const a = 1;
            const b = 2;
            a + b
        "#},
        3,
    )]);
}

#[test]
fn position() {
    let context = &mut Context::default();
    context
        .register_global_callable(
            js_string!("check_stack"),
            2,
            NativeFunction::from_copy_closure(|_, _, context| {
                let frame = context.stack_trace().collect::<Vec<&CallFrame>>();

                assert_eq!(frame.len(), 4);
                assert_eq!(
                    frame[0].position(),
                    CallFrameLocation {
                        function_name: js_string!("myOtherFunction"),
                        path: SourcePath::None,
                        position: Some(Position::new(2, 16))
                    }
                );
                assert_eq!(
                    frame[1].position(),
                    CallFrameLocation {
                        function_name: js_string!("<eval>"),
                        path: SourcePath::Eval,
                        position: Some(Position::new(1, 16))
                    }
                );
                assert_eq!(
                    frame[2].position(),
                    CallFrameLocation {
                        function_name: js_string!("myFunction"),
                        path: SourcePath::None,
                        position: Some(Position::new(5, 9))
                    }
                );
                assert_eq!(
                    frame[3].position(),
                    CallFrameLocation {
                        function_name: js_string!("<main>"),
                        path: SourcePath::None,
                        position: Some(Position::new(8, 11))
                    }
                );
                Ok(JsValue::undefined())
            }),
        )
        .expect("Could not register function");
    run_test_actions_with(
        [TestAction::run(indoc! {r#"
            const myOtherFunction = () => {
                check_stack();
            };
            function myFunction() {
                eval("myOtherFunction()");
            }

            myFunction();
        "#})],
        context,
    );
}

#[test]
fn try_catch_finally_from_init() {
    // the initialisation of the array here emits a PopOnReturnAdd op
    //
    // here we test that the stack is not popped more than intended due to multiple catches in the
    // same function, which could lead to VM stack corruption
    run_test_actions([TestAction::assert_opaque_error(
        indoc! {r#"
            try {
                [(() => {throw "h";})()];
            } catch (x) {
                throw "h";
            } finally {
            }
        "#},
        js_str!("h"),
    )]);
}

#[test]
fn multiple_catches() {
    // see explanation on `try_catch_finally_from_init`
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            try {
                try {
                    [(() => {throw "h";})()];
                } catch (x) {
                    throw "h";
                }
            } catch (y) {
            }
        "#},
        JsValue::undefined(),
    )]);
}

#[test]
fn use_last_expr_try_block() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            try {
                19;
                7.5;
                "Hello!";
            } catch (y) {
                14;
                "Bye!"
            }
        "#},
        js_str!("Hello!"),
    )]);
}

#[test]
fn use_last_expr_catch_block() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            try {
                throw Error("generic error");
                19;
                7.5;
            } catch (y) {
                14;
                "Hello!";
            }
        "#},
        js_str!("Hello!"),
    )]);
}

#[test]
fn no_use_last_expr_finally_block() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            try {
            } catch (y) {
            } finally {
                "Unused";
            }
        "#},
        JsValue::undefined(),
    )]);
}

#[test]
fn finally_block_binding_env() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let buf = "Hey hey";
            try {
            } catch (y) {
            } finally {
                let x = " people";
                buf += x;
            }
            buf
        "#},
        js_str!("Hey hey people"),
    )]);
}

#[test]
fn run_super_method_in_object() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let proto = {
                m() { return "super"; }
            };
            let obj = {
                v() { return super.m(); }
            };
            Object.setPrototypeOf(obj, proto);
            obj.v();
        "#},
        js_str!("super"),
    )]);
}

#[test]
fn get_reference_by_super() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            var fromA, fromB;
            var A = { fromA: 'a', fromB: 'a' };
            var B = { fromB: 'b' };
            Object.setPrototypeOf(B, A);
            var obj = {
                fromA: 'c',
                fromB: 'c',
                method() {
                    fromA = (() => { return super.fromA; })();
                    fromB = (() => { return super.fromB; })();
                }
            };
            Object.setPrototypeOf(obj, B);
            obj.method();
            fromA + fromB
        "#},
        js_str!("ab"),
    )]);
}

#[test]
fn super_call_constructor_null() {
    run_test_actions([TestAction::assert_native_error(
        indoc! {r#"
            class A extends Object {
                constructor() {
                    Object.setPrototypeOf(A, null);
                    super(A);
                }
            }
            new A();
        "#},
        JsNativeErrorKind::Type,
        "super constructor object must be constructor",
    )]);
}

#[test]
fn super_call_get_constructor_before_arguments_execution() {
    run_test_actions([TestAction::assert(indoc! {r#"
        class A extends Object {
            constructor() {
                super(Object.setPrototypeOf(A, null));
            }
        }
        new A() instanceof A;
    "#})]);
}

#[test]
fn order_of_execution_in_assignment() {
    run_test_actions([
        TestAction::run(indoc! {r#"
                let i = 0;
                let array = [[]];

                array[i++][i++] = i++;
            "#}),
        TestAction::assert_eq("i", 3),
        TestAction::assert_eq("array.length", 1),
        TestAction::assert_eq("array[0].length", 2),
    ]);
}

#[test]
fn order_of_execution_in_assignment_with_comma_expressions() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let result = "";
            function f(i) {
                result += i;
            }
            let a = [[]];
            (f(1), a)[(f(2), 0)][(f(3), 0)] = (f(4), 123);
            result
        "#},
        js_str!("1234"),
    )]);
}

#[test]
fn loop_runtime_limit() {
    run_test_actions([
        TestAction::assert_eq(
            indoc! {r#"
                for (let i = 0; i < 20; ++i) { }
            "#},
            JsValue::undefined(),
        ),
        TestAction::inspect_context(|context| {
            context.runtime_limits_mut().set_loop_iteration_limit(10);
        }),
        TestAction::assert_runtime_limit_error(
            indoc! {r#"
                for (let i = 0; i < 20; ++i) { }
            "#},
            RuntimeLimitError::LoopIteration,
        ),
        TestAction::assert_eq(
            indoc! {r#"
                for (let i = 0; i < 10; ++i) { }
            "#},
            JsValue::undefined(),
        ),
        TestAction::assert_runtime_limit_error(
            indoc! {r#"
                while (1) { }
            "#},
            RuntimeLimitError::LoopIteration,
        ),
    ]);
}

#[test]
fn recursion_runtime_limit() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            function factorial(n) {
                if (n == 0) {
                    return 1;
                }

                return n * factorial(n - 1);
            }
        "#}),
        TestAction::assert_eq("factorial(8)", JsValue::new(40_320)),
        TestAction::assert_eq("factorial(11)", JsValue::new(39_916_800)),
        TestAction::inspect_context(|context| {
            context.runtime_limits_mut().set_recursion_limit(10);
        }),
        TestAction::assert_runtime_limit_error("factorial(11)", RuntimeLimitError::Recursion),
        TestAction::assert_eq("factorial(8)", JsValue::new(40_320)),
        TestAction::assert_runtime_limit_error(
            indoc! {r#"
                function x() {
                    x()
                }

                x()
            "#},
            RuntimeLimitError::Recursion,
        ),
    ]);
}

#[test]
fn arguments_object_constructor_valid_index() {
    run_test_actions([TestAction::assert_eq(
        indoc! {r#"
            let args;
            function F(a = 1) {
                args = arguments;
            }
            new F();
            typeof args
        "#},
        js_str!("object"),
    )]);
}

#[test]
fn empty_return_values() {
    run_test_actions([
        TestAction::run(indoc! {r#"do {{}} while (false);"#}),
        TestAction::run(indoc! {r#"do try {{}} catch {} while (false);"#}),
        TestAction::run(indoc! {r#"do {} while (false);"#}),
        TestAction::run(indoc! {r#"do try {{}{}} catch {} while (false);"#}),
        TestAction::run(indoc! {r#"do {{}{}} while (false);"#}),
        TestAction::run(indoc! {r#"do {;{}} while (false);"#}),
        TestAction::run(indoc! {r#"do {e: {}} while (false);"#}),
        TestAction::run(indoc! {r#"do {e: ;} while (false);"#}),
        TestAction::run(indoc! {r#"do { break } while (false);"#}),
        TestAction::run(indoc! {r#"while (true) a: break"#}),
        TestAction::run(indoc! {r#"while (true) a: {"a"; break};"#}),
        TestAction::run(indoc! {r#"do {"a";{}} while (false);"#}),
        TestAction::run(indoc! {r#"
            switch (false) {
                default: {}
            }
        "#}),
        TestAction::run(indoc! {r#"
            switch (false) {
                default: {}{}
            }
        "#}),
        TestAction::run(indoc! {r#"
            switch (false) {
                default: ;{}{}
            }
        "#}),
    ]);
}

#[test]
fn truncate_environments_on_non_caught_native_error() {
    let source = "with (new Proxy({}, {has: p => false})) {a}";
    run_test_actions([
        TestAction::assert_native_error(source, JsNativeErrorKind::Reference, "a is not defined"),
        TestAction::assert_native_error(source, JsNativeErrorKind::Reference, "a is not defined"),
    ]);
}

#[test]
fn super_construction_with_parameter_expression() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            class Person {
                constructor(name) {
                    this.name = name;
                }
            }

            class Student extends Person {
                constructor(name = 'unknown') {
                    super(name);
                }
            }
        "#}),
        TestAction::assert_eq("new Student().name", js_str!("unknown")),
        TestAction::assert_eq("new Student('Jack').name", js_str!("Jack")),
    ]);
}

#[test]
fn cross_context_function_call() {
    let context1 = &mut Context::default();
    let result = context1.eval(Source::from_bytes(indoc! {r"
        var global = 100;

        (function x() {
            return global;
        })
    "}));

    assert!(result.is_ok());
    let result = result.unwrap();
    assert!(result.is_callable());

    let context2 = &mut Context::default();

    context2
        .register_global_property(js_string!("func"), result, Attribute::all())
        .unwrap();

    let result = context2.eval(Source::from_bytes("func()"));

    assert_eq!(result, Ok(JsValue::new(100)));
}

// See: https://github.com/boa-dev/boa/issues/1848
#[test]
fn long_object_chain_gc_trace_stack_overflow() {
    run_test_actions([
        TestAction::run(indoc! {r#"
            let old = {};
            for (let i = 0; i < 100000; i++) {
                old = { old };
            }
        "#}),
        TestAction::inspect_context(|_| boa_gc::force_collect()),
    ]);
}

// See: https://github.com/boa-dev/boa/issues/4515
#[test]
fn recursion_in_async_gen_throws_uncatchable_error() {
    run_test_actions([
        TestAction::inspect_context(|context| {
            context.runtime_limits_mut().set_recursion_limit(128);
        }),
        TestAction::assert_runtime_limit_error(
            indoc! {r#"
                async function* f() {}
                f().return({
                  get then() {
                    this.then;
                  },
                });
            "#},
            RuntimeLimitError::Recursion,
        ),
    ]);
}

#[test]
fn recursion_in_setter_throws_uncatchable_error() {
    run_test_actions([
        TestAction::inspect_context(|context| {
            context.runtime_limits_mut().set_recursion_limit(128);
        }),
        TestAction::assert_runtime_limit_error(
            indoc! {r#"
                const obj = {
                  set x(value) {
                    this.x = value;
                  },
                };
                obj.x = 1;
            "#},
            RuntimeLimitError::Recursion,
        ),
    ]);
}
