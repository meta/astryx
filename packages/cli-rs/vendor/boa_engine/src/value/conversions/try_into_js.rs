use crate::class::Class;
use crate::{Context, JsNativeError, JsResult, JsString, JsValue};

/// This trait adds a conversions from a Rust Type into [`JsValue`].
pub trait TryIntoJs: Sized {
    /// This function tries to convert a `Self` into [`JsValue`].
    fn try_into_js(&self, context: &mut Context) -> JsResult<JsValue>;
}

impl<T> TryIntoJs for T
where
    T: Class + Clone,
{
    fn try_into_js(&self, context: &mut Context) -> JsResult<JsValue> {
        T::from_data(self.clone(), context).map(JsValue::from)
    }
}

impl TryIntoJs for bool {
    fn try_into_js(&self, _context: &mut Context) -> JsResult<JsValue> {
        Ok(JsValue::from(*self))
    }
}

impl TryIntoJs for &str {
    fn try_into_js(&self, _context: &mut Context) -> JsResult<JsValue> {
        Ok(JsValue::from(JsString::from(*self)))
    }
}
impl TryIntoJs for String {
    fn try_into_js(&self, _context: &mut Context) -> JsResult<JsValue> {
        Ok(JsValue::from(JsString::from(self.as_str())))
    }
}

macro_rules! impl_try_into_js_by_from {
    ($t:ty) => {
        impl TryIntoJs for $t {
            fn try_into_js(&self, _context: &mut Context) -> JsResult<JsValue> {
                Ok(JsValue::from(self.clone()))
            }
        }
    };
    [$($ts:ty),+] => {
        $(impl_try_into_js_by_from!($ts);)+
    }
}
impl_try_into_js_by_from![i8, u8, i16, u16, i32, u32, f32, f64];
impl_try_into_js_by_from![
    JsValue,
    JsString,
    crate::JsBigInt,
    crate::JsObject,
    crate::JsSymbol,
    crate::object::JsArray,
    crate::object::JsArrayBuffer,
    crate::object::JsDataView,
    crate::object::JsDate,
    crate::object::JsFunction,
    crate::object::JsGenerator,
    crate::object::JsMapIterator,
    crate::object::JsMap,
    crate::object::JsSetIterator,
    crate::object::JsSet,
    crate::object::JsSharedArrayBuffer,
    crate::object::JsInt8Array,
    crate::object::JsInt16Array,
    crate::object::JsInt32Array,
    crate::object::JsUint8Array,
    crate::object::JsUint16Array,
    crate::object::JsUint32Array,
    crate::object::JsFloat32Array,
    crate::object::JsFloat64Array
];

const MAX_SAFE_INTEGER_I64: i64 = (1 << 53) - 1;
const MIN_SAFE_INTEGER_I64: i64 = -MAX_SAFE_INTEGER_I64;

fn err_outside_safe_range() -> crate::JsError {
    JsNativeError::typ()
        .with_message("cannot convert value into JsValue: the value is outside the safe range")
        .into()
}
fn convert_safe_i64(value: i64) -> JsValue {
    i32::try_from(value).map_or(JsValue::from(value as f64), JsValue::new)
}

impl TryIntoJs for i64 {
    fn try_into_js(&self, _context: &mut Context) -> JsResult<JsValue> {
        let value = *self;
        if (MIN_SAFE_INTEGER_I64..MAX_SAFE_INTEGER_I64).contains(&value) {
            Ok(convert_safe_i64(value))
        } else {
            Err(err_outside_safe_range())
        }
    }
}
impl TryIntoJs for u64 {
    fn try_into_js(&self, _context: &mut Context) -> JsResult<JsValue> {
        let value = *self;
        if (MAX_SAFE_INTEGER_I64 as u64) < value {
            Err(err_outside_safe_range())
        } else {
            Ok(convert_safe_i64(value as i64))
        }
    }
}
impl TryIntoJs for isize {
    fn try_into_js(&self, _context: &mut Context) -> JsResult<JsValue> {
        let value = *self as i64;
        if (MIN_SAFE_INTEGER_I64..MAX_SAFE_INTEGER_I64).contains(&value) {
            Ok(convert_safe_i64(value))
        } else {
            Err(err_outside_safe_range())
        }
    }
}
impl TryIntoJs for usize {
    fn try_into_js(&self, _context: &mut Context) -> JsResult<JsValue> {
        let value = *self;
        if (MAX_SAFE_INTEGER_I64 as usize) < value {
            Err(err_outside_safe_range())
        } else {
            Ok(convert_safe_i64(value as i64))
        }
    }
}
impl TryIntoJs for i128 {
    fn try_into_js(&self, _context: &mut Context) -> JsResult<JsValue> {
        let value = *self;
        if value < i128::from(MIN_SAFE_INTEGER_I64) || i128::from(MAX_SAFE_INTEGER_I64) < value {
            Err(err_outside_safe_range())
        } else {
            Ok(convert_safe_i64(value as i64))
        }
    }
}
impl TryIntoJs for u128 {
    fn try_into_js(&self, _context: &mut Context) -> JsResult<JsValue> {
        let value = *self;
        if (MAX_SAFE_INTEGER_I64 as u128) < value {
            Err(err_outside_safe_range())
        } else {
            Ok(convert_safe_i64(value as i64))
        }
    }
}

impl<T> TryIntoJs for Option<T>
where
    T: TryIntoJs,
{
    fn try_into_js(&self, context: &mut Context) -> JsResult<JsValue> {
        match self {
            Some(x) => x.try_into_js(context),
            None => Ok(JsValue::undefined()),
        }
    }
}

impl<T> TryIntoJs for Vec<T>
where
    T: TryIntoJs,
{
    fn try_into_js(&self, context: &mut Context) -> JsResult<JsValue> {
        let arr = crate::object::JsArray::new(context)?;
        for value in self {
            let value = value.try_into_js(context)?;
            arr.push(value, context)?;
        }
        Ok(arr.into())
    }
}

macro_rules! impl_try_into_js_for_tuples {
    ($($names:ident : $ts:ident),+) => {
        impl<$($ts: TryIntoJs,)+> TryIntoJs for ($($ts,)+) {
            fn try_into_js(&self, context: &mut Context) -> JsResult<JsValue> {
                let ($($names,)+) = self;
                let arr = crate::object::JsArray::new(context)?;
                $(arr.push($names.try_into_js(context)?, context)?;)+
                Ok(arr.into())
            }
        }
    };
}

impl_try_into_js_for_tuples!(a: A);
impl_try_into_js_for_tuples!(a: A, b: B);
impl_try_into_js_for_tuples!(a: A, b: B, c: C);
impl_try_into_js_for_tuples!(a: A, b: B, c: C, d: D);
impl_try_into_js_for_tuples!(a: A, b: B, c: C, d: D, e: E);
impl_try_into_js_for_tuples!(a: A, b: B, c: C, d: D, e: E, f: F);
impl_try_into_js_for_tuples!(a: A, b: B, c: C, d: D, e: E, f: F, g: G);
impl_try_into_js_for_tuples!(a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H);
impl_try_into_js_for_tuples!(a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I);
impl_try_into_js_for_tuples!(a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J);
impl_try_into_js_for_tuples!(a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K);

impl TryIntoJs for () {
    fn try_into_js(&self, _context: &mut Context) -> JsResult<JsValue> {
        Ok(JsValue::null())
    }
}

impl<T, S> TryIntoJs for std::collections::HashSet<T, S>
where
    T: TryIntoJs,
{
    fn try_into_js(&self, context: &mut Context) -> JsResult<JsValue> {
        let set = crate::object::JsSet::new(context);
        for value in self {
            let value = value.try_into_js(context)?;
            set.add(value, context)?;
        }
        Ok(set.into())
    }
}

impl<K, V, S> TryIntoJs for std::collections::HashMap<K, V, S>
where
    K: TryIntoJs,
    V: TryIntoJs,
{
    fn try_into_js(&self, context: &mut Context) -> JsResult<JsValue> {
        let map = crate::object::JsMap::new(context);
        for (key, value) in self {
            let key = key.try_into_js(context)?;
            let value = value.try_into_js(context)?;
            map.set(key, value, context)?;
        }
        Ok(map.into())
    }
}

#[cfg(test)]
mod try_into_js_tests {
    use crate::value::{TryFromJs, TryIntoJs};
    use crate::{Context, JsResult};

    #[test]
    fn big_int_err() {
        fn assert<T: TryIntoJs>(int: &T, context: &mut Context) {
            let expect_err = int.try_into_js(context);
            assert!(expect_err.is_err());
        }

        let mut context = Context::default();
        let context = &mut context;

        let int = (1 << 55) + 17i64;
        assert(&int, context);

        let int = (1 << 55) + 17u64;
        assert(&int, context);

        let int = (1 << 55) + 17u128;
        assert(&int, context);

        let int = (1 << 55) + 17i128;
        assert(&int, context);
    }

    #[test]
    fn int_tuple() -> JsResult<()> {
        let mut context = Context::default();
        let context = &mut context;

        let tuple_initial = (
            -42i8,
            42u8,
            1764i16,
            7641u16,
            -((1 << 27) + 13),
            (1 << 27) + 72u32,
            (1 << 49) + 1793i64,
            (1 << 49) + 1793u64,
            -((1 << 49) + 7193i128),
            (1 << 49) + 9173u128,
        );

        // it will rewrite without reading, so it's just for auto type resolving.
        #[allow(unused_assignments)]
        let mut tuple_after_transform = tuple_initial;

        let js_value = tuple_initial.try_into_js(context)?;
        tuple_after_transform = TryFromJs::try_from_js(&js_value, context)?;

        assert_eq!(tuple_initial, tuple_after_transform);
        Ok(())
    }

    #[test]
    fn string() -> JsResult<()> {
        let mut context = Context::default();
        let context = &mut context;

        let s_init = "String".to_string();
        let js_value = s_init.try_into_js(context)?;
        let s: String = TryFromJs::try_from_js(&js_value, context)?;
        assert_eq!(s_init, s);
        Ok(())
    }

    #[test]
    fn vec() -> JsResult<()> {
        let mut context = Context::default();
        let context = &mut context;

        let vec_init = vec![(-4i64, 2u64), (15, 15), (32, 23)];
        let js_value = vec_init.try_into_js(context)?;
        println!("JsValue: {}", js_value.display());
        let vec: Vec<(i64, u64)> = TryFromJs::try_from_js(&js_value, context)?;
        assert_eq!(vec_init, vec);
        Ok(())
    }
}
