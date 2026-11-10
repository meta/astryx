#[cfg(feature = "annex-b")]
use crate::builtins::is_html_dda::IsHTMLDDA;
use crate::{JsBigInt, JsObject, JsSymbol, JsValue};
use boa_engine::js_string;
use boa_string::JsString;

/// A non-mutable variant of a `JsValue`.
/// Represents either a primitive value ([`bool`], [`f64`], [`i32`]) or a reference
/// to a heap allocated value ([`JsString`], [`JsSymbol`]).
#[derive(Debug, PartialEq)]
pub enum JsVariant {
    /// `null` - A null value, for when a value doesn't exist.
    Null,
    /// `undefined` - An undefined value, for when a field or index doesn't exist.
    Undefined,
    /// `boolean` - A `true` / `false` value, for if a certain criteria is met.
    Boolean(bool),
    /// `String` - A UTF-16 string, such as `"Hello, world"`.
    String(JsString),
    /// `Number` - A 64-bit floating point number, such as `3.1415` or `Infinity`.
    /// This is the default representation of a number. If a number can be represented
    /// as an integer, it will be stored as an `Integer` variant instead.
    Float64(f64),
    /// `Number` - A 32-bit integer, such as `42`.
    Integer32(i32),
    /// `BigInt` - holds any arbitrary large signed integer.
    BigInt(JsBigInt),
    /// `Object` - An object, such as `Math`, represented by a binary tree of string keys to Javascript values.
    Object(JsObject),
    /// `Symbol` - A Symbol Primitive type.
    Symbol(JsSymbol),
}

impl From<JsVariant> for JsValue {
    fn from(value: JsVariant) -> Self {
        match value {
            JsVariant::Null => JsValue::null(),
            JsVariant::Undefined => JsValue::undefined(),
            JsVariant::Boolean(b) => JsValue::new(b),
            JsVariant::String(s) => JsValue::new(s),
            JsVariant::Float64(f) => JsValue::new(f),
            JsVariant::Integer32(i) => JsValue::new(i),
            JsVariant::BigInt(b) => JsValue::new(b),
            JsVariant::Object(o) => JsValue::new(o),
            JsVariant::Symbol(s) => JsValue::new(s),
        }
    }
}

impl JsVariant {
    /// Check if the variant is an `undefined` value.
    #[inline]
    #[must_use]
    pub fn is_undefined(&self) -> bool {
        matches!(self, JsVariant::Undefined)
    }

    /// `typeof` operator. Returns a string representing the type of the
    /// given ECMA Value.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-typeof-operator
    #[must_use]
    pub fn type_of(&self) -> &'static str {
        match self {
            JsVariant::Float64(_) | JsVariant::Integer32(_) => "number",
            JsVariant::String(_) => "string",
            JsVariant::Boolean(_) => "boolean",
            JsVariant::Symbol(_) => "symbol",
            JsVariant::Null => "object",
            JsVariant::Undefined => "undefined",
            JsVariant::BigInt(_) => "bigint",
            JsVariant::Object(object) => {
                #[cfg(feature = "annex-b")]
                if object.is::<IsHTMLDDA>() {
                    return "undefined";
                }
                if object.is_callable() {
                    "function"
                } else {
                    "object"
                }
            }
        }
    }

    /// Same as [`JsVariant::type_of`], but returning a [`JsString`] instead.
    #[must_use]
    pub fn js_type_of(&self) -> JsString {
        match self {
            JsVariant::Float64(_) | JsVariant::Integer32(_) => js_string!("number"),
            JsVariant::String(_) => js_string!("string"),
            JsVariant::Boolean(_) => js_string!("boolean"),
            JsVariant::Symbol(_) => js_string!("symbol"),
            JsVariant::Null => js_string!("object"),
            JsVariant::Undefined => js_string!("undefined"),
            JsVariant::BigInt(_) => js_string!("bigint"),
            JsVariant::Object(object) => {
                #[cfg(feature = "annex-b")]
                if object.is::<IsHTMLDDA>() {
                    return js_string!("undefined");
                }
                if object.is_callable() {
                    js_string!("function")
                } else {
                    js_string!("object")
                }
            }
        }
    }
}
