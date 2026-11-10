//! Declare implementations of [`TryIntoJsResult`] trait for various types.

use crate::value::TryIntoJs;
use crate::{Context, JsResult, JsValue, TryIntoJsResult};

impl<T> TryIntoJsResult for T
where
    T: TryIntoJs,
{
    fn try_into_js_result(self, ctx: &mut Context) -> JsResult<JsValue> {
        self.try_into_js(ctx)
    }
}

impl<T> TryIntoJsResult for JsResult<T>
where
    T: TryIntoJsResult,
{
    fn try_into_js_result(self, cx: &mut Context) -> JsResult<JsValue> {
        self.and_then(|value| value.try_into_js_result(cx))
    }
}
