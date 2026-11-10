use super::JsValue;

/// Possible types of values as defined at <https://tc39.es/ecma262/#sec-typeof-operator>.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Type {
    /// The "undefined" type.
    Undefined,

    /// The "null" type.
    Null,

    /// The "boolean" type.
    Boolean,

    /// The "number" type.
    Number,

    /// The "string" type.
    String,

    /// The "symbol" type.
    Symbol,

    /// The "bigint" type.
    BigInt,

    /// The "object" type.
    Object,
}

impl JsValue {
    /// Get the type of a value
    ///
    /// This is the abstract operation Type(v), as described in
    /// <https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html#sec-ecmascript-language-types>.
    ///
    /// Check [`JsValue::type_of`] if you need to call the `typeof` operator.
    #[must_use]
    #[inline]
    pub fn get_type(&self) -> Type {
        self.0.get_type()
    }
}
