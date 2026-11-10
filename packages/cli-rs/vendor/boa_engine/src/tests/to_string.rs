#![allow(clippy::items_after_statements)]

use std::fmt::Debug;

use crate::{Context, value::TryFromJs};
use boa_parser::Source;

/// We test nested `toString()` cases:
/// * an ordinary within an ordinary // `ordinary_1` --> `ordinary_2`
/// * an ordinary within an arrow // `ordinary_0` --> `arrow_3`
/// * an arrow within an ordinary // `arrow_2` --> `ordinary_2`
/// * an arrow within an arrow // `arrow_1` --> `arrow_3`
///
/// And also test top level `toString()` workability.
///
/// It use `format!(..)` to avoid copy-past & human mistakes
#[test]
fn test_ordinary_and_arrow_to_string() {
    let ordinary_0 = "function oa3(yy, xx) {
        return xx * 3 + yy
    }";
    let arrow_1 = r#"(b) => b * 2"#;
    let arrow_2 = r#"(b) => b * /* --- */ 4"#;
    let arrow_3 = format!(
        r#"(a) => {{
        ia1 = {arrow_1}    ;
        // \\ // \\ // \\ // \\ // \\ // \\ // \\
        A    =    ia1 . toString(    );
        {ordinary_0}
        A1 = oa3.toString(  );
        return ia1(a) - 1
    }}"#
    );

    let ordinary_1 = r#"function oa1(yy, xx) {
        return xx * 3 + yy
    }"#;
    let ordinary_2 = format!(
        "function oa2(a, boba) {{
        {ordinary_1}
        B = oa1.toString();;;
        C = oa2.toString();
        ia2 = {arrow_2};
        D = ia2.toString();
        return oa1(a, 5) - boba;
    }}"
    );

    let code = format!(
        "unused_f = (b) => b * b      ;
        var A;
        var A1;
        var B;
        var C;
        var D;
        var E;
        var F;

        ia3 = {arrow_3};

        {ordinary_2}

        oa2(7, 2);
        ia3(7);

        const x = {{
            a: A,
            a1: A1,
            b: B,
            c: C,
            d: D,
            e: ia3.toString(),
            f: oa2.toString(),
        }};

        x"
    );

    #[derive(Debug, TryFromJs, PartialEq, Eq)]
    struct Expected {
        a: String,
        a1: String,
        b: String,
        c: String,
        d: String,
        e: String,
        f: String,
    }
    let expected = Expected {
        a: arrow_1.into(),
        a1: ordinary_0.into(),
        b: ordinary_1.into(),
        c: ordinary_2.clone(),
        d: arrow_2.into(),
        e: arrow_3,
        f: ordinary_2,
    };

    assert_helper(&code, expected);
}

#[test]
fn test_simple_generator_to_string() {
    let inner_fn = "function ff(yy, xx) {
        return xx * 3 + yy
    }";
    let generator = format!(
        "function* simpleGenerator() {{
        {inner_fn}
        A = ff.toString();

        yield ff(1, 1);
        yield ff(2, 2);
        yield ff(3, 3);
    }}"
    );

    let code = format!(
        "
        var A;
        var B;

        {generator}
        B = simpleGenerator.toString();

        const gen = simpleGenerator();
        gen.next();
        gen.next();

        const x = {{
            a: A,
            b: B,
        }};
        x"
    );

    #[derive(Debug, TryFromJs, PartialEq, Eq)]
    struct Expected {
        a: String,
        b: String,
    }
    let expected = Expected {
        a: inner_fn.into(),
        b: generator,
    };

    assert_helper(&code, expected);
}

#[test]
fn test_async_fn_to_string() {
    let f = "function resolveAfter2Seconds(x) {
            return new Promise((resolve) => {
                setTimeout(() => {
                resolve(x);
            }, 2000);
        });
    }";
    let async_fn = "async function asyncCall() {
        let r = await resolveAfter2Seconds(88);
        return r
    }";

    let code = format!(
        "
        {f}
        {async_fn}
        const x = {{
            a: asyncCall.toString(),
        }};
        x"
    );

    let expected = ExpectedOne { a: async_fn.into() };
    assert_helper(&code, expected);
}

#[test]
fn test_async_generator_to_string() {
    let async_gen = "async function* asyncGenerator(n) {
        let index = 1    ;
        while (index <= n     ) {
            await new Promise /*   0____0   */   (resolve => setTimeout(resolve, 250, index));
            yield index++;
        }
    }";

    let code = format!(
        "
        {async_gen}
        const x = {{
            a: asyncGenerator.toString(),
        }};
        x"
    );

    let expected = ExpectedOne {
        a: async_gen.into(),
    };
    assert_helper(&code, expected);
}

#[test]
fn test_async_arrow_to_string() {
    let async_arrow = "async (a, b) => {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve(a + b);
            }, 1000);
        });
    }";
    let func_expr = "function(a) {
        return a /* * */ * 2;
    }";
    let async_func_expr = "async function() {
        return /* * */ 1;
    }";
    let gen_expr = "function*(a) {
        yield a /* * */;
        yield a + 1 /* * */;
        yield a + 2 /* * */;
    }";
    let async_gen_expr = "async function*(a) {
        yield await a /* * */;
        yield await a + 1 /* * */;
        yield await a + 2 /* * */;
    }";

    let code = format!(
        "
        const asyncArrowAdd = {async_arrow};
        const funcExpr = {func_expr};
        const asyncFnExpr = {async_func_expr}   ;
        const genExpr = {gen_expr} ;
        const asyncGenExpr = {async_gen_expr};

        const x = {{
            a: asyncArrowAdd.toString(),
            b: funcExpr.toString(),
            c: asyncFnExpr.toString(),
            d: genExpr.toString(),
            e: asyncGenExpr.toString(),
        }};
        x"
    );

    #[derive(Debug, TryFromJs, PartialEq, Eq)]
    struct Expected {
        a: String,
        b: String,
        c: String,
        d: String,
        e: String,
    }
    let expected = Expected {
        a: async_arrow.into(),
        b: func_expr.into(),
        c: async_func_expr.into(),
        d: gen_expr.into(),
        e: async_gen_expr.into(),
    };

    assert_helper(&code, expected);
}

#[test]
fn test_class_methods_to_string() {
    let calc_area = "calcArea() {
        return this.height * this.width;
    }";
    let get_area = "get area() {
        return this.calcArea(/**/);
    }";
    let sides = "*sides() {
        yield this.height;
        yield this.width;
        yield this.height;
        yield this.width;
    }";

    let code = format!(
        "
        class Rectangle {{
            constructor(height, width) {{
                this.height = height;
                this.width = width;
            }}
            {calc_area}
            {get_area}
            {sides}
        }}

        let r = new Rectangle(24, 42);
        const descr = Object.getOwnPropertyDescriptor(Rectangle.prototype, 'area');
        const x = {{
            calc_area: r.calcArea.toString(),
            sides: r.sides.toString(),
            area_val: r.area.toString(),
            area: descr.get.toString(),
        }};
        x"
    );

    #[derive(Debug, TryFromJs, PartialEq, Eq)]
    struct Expected {
        calc_area: String,
        sides: String,
        area_val: String,
        area: String,
    }
    let expected = Expected {
        calc_area: calc_area.into(),
        sides: sides.into(),
        area_val: (24 * 42).to_string(),
        area: get_area.into(),
    };

    assert_helper(&code, expected);
}

#[test]
fn test_obj_methods_to_string() {
    let get_undef = "get p2() { /* / */ }";
    let ordinary = "p3(a, b) { return a + b }";
    let set_p0 = "set p4(a) { /* * */ p0 = a; }";
    let generator = "*vroom_d() { yield 4; }";
    let async_generator = "async* vroom_e() {     }";

    let code = format!(
        "
        const x = {{
            p0: 97,
            p1: true,
            {get_undef},
            {ordinary},
            {set_p0},
            {generator},
            {async_generator},
        }};

        let descr_a = Object.getOwnPropertyDescriptor(x, 'p2');
        let descr_c = Object.getOwnPropertyDescriptor(x, 'p4');

        const ret = {{
            a: descr_a.get.toString(),
            b: x.p3.toString(),
            c: descr_c.set.toString(),
            d: x.vroom_d.toString(),
            e: x.vroom_e.toString(),
        }};
        ret"
    );

    #[derive(Debug, TryFromJs, PartialEq, Eq)]
    struct Expected {
        a: String,
        b: String,
        c: String,
        d: String,
        e: String,
    }
    let expected = Expected {
        a: get_undef.into(),
        b: ordinary.into(),
        c: set_p0.into(),
        d: generator.into(),
        e: async_generator.into(),
    };

    assert_helper(&code, expected);
}

#[test]
fn test_eval_fn_to_string() {
    let function_def = "function f1(x) {
        return 1  +  x * x
    }";
    let code = format!(
        "
        eval(`{function_def};    42`);

        const ret = {{ a: f1.toString() }};
        ret"
    );

    #[derive(Debug, TryFromJs, PartialEq, Eq)]
    struct Expected {
        a: String,
    }
    let expected = Expected {
        a: function_def.into(),
    };

    assert_helper(&code, expected);
}

#[test]
fn test_static_to_string() {
    let fn_def = "function f3(x) {
        return 3  +  x * x  +  3
    }";
    let static_fn_def = format!(
        "staticFunc() {{
                {fn_def};;;
                return f3 . toString()
            }}"
    );
    let fn_in_static_block = "function ff(x) { return \"f\" + \"f\" }";

    let code = format!(
        "
        class TestClass {{
            static {static_fn_def}

            static str = \"\";
            static {{
                {fn_in_static_block};
                this.str = ff.toString();
            }}
        }}

        const ret = {{
            a: TestClass.staticFunc(),
            b: TestClass.staticFunc.toString(),
            c: TestClass.str,
        }};
        ret
        "
    );

    #[derive(Debug, TryFromJs, PartialEq, Eq)]
    struct Expected {
        a: String,
        b: String,
        c: String,
    }
    let expected = Expected {
        a: fn_def.into(),
        b: static_fn_def,
        c: fn_in_static_block.into(),
    };

    assert_helper(&code, expected);
}

#[derive(Debug, TryFromJs, PartialEq, Eq)]
struct ExpectedOne {
    a: String,
}

#[allow(clippy::needless_pass_by_value)]
fn assert_helper<T>(code: &str, expected: T)
where
    T: TryFromJs + Debug + Eq,
{
    let context = &mut Context::default();
    let js = context.eval(Source::from_bytes(code)).unwrap();
    let res = T::try_from_js(&js, context).unwrap();
    assert_eq!(expected, res);
}
