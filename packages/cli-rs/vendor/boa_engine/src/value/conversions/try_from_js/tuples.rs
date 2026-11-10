//! Implementation of [`TryFromJs`] for tuples.
//!
//! Tuples are converted from a JavaScript array, using similar semantics to `TypeScript` tuples:
//!     - If the tuple is shorter than the array, the extra elements are ignored.
//!     - If the tuple is longer than the array, the extra elements are `undefined`.
//!     - If the array is empty, all elements are `undefined`.
//!
//! A tuple of size 0 (unit type) does not implement [`TryFromJs`].

use crate::value::JsValue;
use crate::{Context, JsResult};

use super::TryFromJs;

macro_rules! impl_try_from_js_for_tuples {
    ($($name:ident),*) => {
        impl<$($name: TryFromJs),*> TryFromJs for ($($name,)*) {
            fn try_from_js(value: &JsValue, context: &mut Context) -> JsResult<Self> {
                let vec: Vec<JsValue> = value.try_js_into(context)?;
                let mut iter = vec.into_iter();

                Ok((
                    $(
                        $name::try_from_js(&iter.next().unwrap_or_else(JsValue::undefined), context)?,
                    )*
                ))
            }
        }
    };
}

impl_try_from_js_for_tuples!(A);
impl_try_from_js_for_tuples!(A, B);
impl_try_from_js_for_tuples!(A, B, C);
impl_try_from_js_for_tuples!(A, B, C, D);
impl_try_from_js_for_tuples!(A, B, C, D, E);
impl_try_from_js_for_tuples!(A, B, C, D, E, F);
impl_try_from_js_for_tuples!(A, B, C, D, E, F, G);
impl_try_from_js_for_tuples!(A, B, C, D, E, F, G, H);
impl_try_from_js_for_tuples!(A, B, C, D, E, F, G, H, I);
impl_try_from_js_for_tuples!(A, B, C, D, E, F, G, H, I, J);
