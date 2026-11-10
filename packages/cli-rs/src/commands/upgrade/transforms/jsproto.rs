//! JS object-literal lookup semantics. The JS codemods look names up in plain
//! objects (`MAP[name]`, `name in MAP`), so a name such as `toString` finds the
//! inherited `Object.prototype` member. A codemod then either writes that value
//! into the tree (it prints as `String(value)`) or hands it to an ast-types
//! builder, which throws. These helpers reproduce both outcomes.

use super::super::jsc::CodemodError;

const FUNCTIONS: &[(&str, &str)] = &[
    ("constructor", "Object"),
    ("toString", "toString"),
    ("valueOf", "valueOf"),
    ("hasOwnProperty", "hasOwnProperty"),
    ("isPrototypeOf", "isPrototypeOf"),
    ("propertyIsEnumerable", "propertyIsEnumerable"),
    ("toLocaleString", "toLocaleString"),
    ("__defineGetter__", "__defineGetter__"),
    ("__defineSetter__", "__defineSetter__"),
    ("__lookupGetter__", "__lookupGetter__"),
    ("__lookupSetter__", "__lookupSetter__"),
];

/// An inherited `Object.prototype` member.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Proto(&'static str);

impl Proto {
    /// `String(value)`.
    pub fn string(&self) -> String {
        if self.0 == "__proto__" {
            return "[object Object]".into();
        }
        format!("function {}() {{ [native code] }}", self.0)
    }
    /// ast-types' `shallowStringify(value)`.
    pub fn shallow(&self) -> &'static str {
        if self.0 == "__proto__" {
            "{}"
        } else {
            "undefined"
        }
    }
    /// The error an ast-types builder throws for this value.
    pub fn builder_error(&self, field: &str, types: &str, ty: &str) -> CodemodError {
        CodemodError::msg(format!("{} does not match field \"{}\": {} of type {}", self.shallow(), field, types, ty))
    }
}

/// The inherited member a plain-object lookup of `key` finds, if any.
pub fn proto(key: &str) -> Option<Proto> {
    if key == "__proto__" {
        return Some(Proto("__proto__"));
    }
    FUNCTIONS.iter().find(|(k, _)| *k == key).map(|(_, n)| Proto(n))
}

/// What `MAP[key]` yields for a plain object literal.
#[derive(Debug, Clone, PartialEq)]
pub enum Hit<'a> {
    Own(&'a str),
    Proto(Proto),
}

impl Hit<'_> {
    /// `String(value)` as the tree would print it.
    pub fn string(&self) -> String {
        match self {
            Hit::Own(s) => s.to_string(),
            Hit::Proto(p) => p.string(),
        }
    }
}

/// `MAP[key]` (own entries first, then `Object.prototype`).
pub fn lookup<'a>(map: &[(&str, &'a str)], key: &str) -> Option<Hit<'a>> {
    if let Some((_, v)) = map.iter().find(|(k, _)| *k == key) {
        return Some(Hit::Own(v));
    }
    proto(key).map(Hit::Proto)
}
