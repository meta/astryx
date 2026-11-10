//! Tests for the macros in this crate.

#![allow(unused_crate_dependencies)]

use boa_engine::value::TryFromJs;
use boa_engine::{Context, JsResult, JsValue, Source, js_string};
use boa_string::JsString;

#[test]
fn try_from_js_derive() {
    #[derive(Debug, TryFromJs, Eq, PartialEq)]
    struct TryFromJsTest {
        a: JsString,
        #[boa(rename = "bBB")]
        b: i32,
        #[boa(from_js_with = "check_tfj_called")]
        c: i32,
    }

    fn check_tfj_called(value: &JsValue, context: &mut Context) -> JsResult<i32> {
        let v = value.to_i32(context)?;
        Ok(v / 2)
    }

    let mut context = Context::default();
    let obj = context
        .eval(Source::from_bytes(br#"({ a: "hello", bBB: 42, c: 120 })"#))
        .unwrap();

    let result = TryFromJsTest::try_from_js(&obj, &mut context).unwrap();
    assert_eq!(
        result,
        TryFromJsTest {
            a: js_string!("hello"),
            b: 42,
            c: 60
        }
    );
}
