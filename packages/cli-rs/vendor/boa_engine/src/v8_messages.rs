//! Error messages worded as V8 words them (patched in for the Astryx CLI
//! clone, whose output must match Node's).

use crate::{JsNativeError, JsObject, JsValue, property::PropertyKey, value::JsVariant};

fn kind(value: &JsValue) -> &'static str {
    if value.is_null() { "null" } else { "undefined" }
}

/// `undefined.x` / `null.x`.
pub(crate) fn read_properties(value: &JsValue, key: &PropertyKey) -> JsNativeError {
    JsNativeError::typ().with_message(format!(
        "Cannot read properties of {} (reading '{key}')",
        kind(value)
    ))
}

/// `undefined.x = v` / `null.x = v`.
pub(crate) fn set_properties(value: &JsValue, key: &PropertyKey) -> JsNativeError {
    JsNativeError::typ().with_message(format!(
        "Cannot set properties of {} (setting '{key}')",
        kind(value)
    ))
}

/// `ToObject(undefined | null)` outside property access.
pub(crate) const TO_OBJECT: &str = "Cannot convert undefined or null to object";

/// How V8 names an object in "read only property" messages.
pub(crate) fn object_tag(object: &JsObject) -> String {
    if object.is_array() {
        return "[object Array]".into();
    }
    let ctor = object
        .borrow()
        .prototype()
        .and_then(|p| {
            let p = p.borrow();
            p.properties()
                .get(&crate::js_string!("constructor").into())
                .and_then(|d| d.value().cloned())
        })
        .and_then(|c| c.as_object())
        .and_then(|c| {
            c.borrow()
                .properties()
                .get(&crate::js_string!("name").into())
                .and_then(|d| d.value().cloned())
        })
        .and_then(|n| n.as_string().map(|s| s.to_std_string_escaped()))
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "Object".into());
    format!("#<{ctor}>")
}

/// A failed strict-mode `[[Set]]`.
pub(crate) fn failed_set(object: &JsObject, key: &PropertyKey, exists: bool) -> JsNativeError {
    if exists {
        JsNativeError::typ().with_message(format!(
            "Cannot assign to read only property '{key}' of object '{}'",
            object_tag(object)
        ))
    } else {
        JsNativeError::typ().with_message(format!(
            "Cannot add property {key}, object is not extensible"
        ))
    }
}

/// `typeof v` + value, as V8 names a non-callable callback.
pub(crate) fn describe_value(value: &JsValue) -> String {
    match value.variant() {
        JsVariant::Undefined => "undefined".into(),
        JsVariant::Null => "object null".into(),
        JsVariant::Boolean(b) => format!("boolean {b}"),
        JsVariant::Integer32(n) => format!("number {n}"),
        JsVariant::Float64(n) => format!("number {}", crate::builtins::number::Number::to_js_string_radix(n, 10).to_std_string_escaped()),
        JsVariant::String(s) => format!("string \"{}\"", s.to_std_string_escaped()),
        JsVariant::Symbol(s) => format!("symbol {}", s.descriptive_string().to_std_string_escaped()),
        JsVariant::BigInt(b) => format!("bigint {b}"),
        JsVariant::Object(o) => {
            if o.is_callable() { "function".into() } else { "object".into() }
        }
    }
}

/// The message the instruction now running records for `value`, if any.
pub(crate) fn at_pc(context: &crate::Context, kind: char, value: &JsValue) -> Option<String> {
    let frame = context.vm.frames.last()?;
    frame.code_block().v8_message(frame.pc, kind, value)
}

/// A call of a value that is not a function.
pub(crate) fn not_callable(context: &crate::Context, value: &JsValue) -> JsNativeError {
    let msg = at_pc(context, 'C', value).unwrap_or_else(|| format!("{} is not a function", describe_value(value)));
    JsNativeError::typ().with_message(msg)
}

/// `new` of a value that is not a constructor.
pub(crate) fn not_constructor(context: &crate::Context, value: &JsValue) -> JsNativeError {
    let msg = at_pc(context, 'N', value).unwrap_or_else(|| format!("{} is not a constructor", describe_value(value)));
    JsNativeError::typ().with_message(msg)
}

/// A value without `[Symbol.iterator]` where an iterable is required.
pub(crate) fn not_iterable(context: &crate::Context, value: &JsValue) -> JsNativeError {
    let msg = at_pc(context, 'I', value).unwrap_or_else(|| {
        let what = if value.is_undefined() { "undefined".to_string() } else { describe_value(value) };
        format!("{what} is not iterable (cannot read property Symbol(Symbol.iterator))")
    });
    JsNativeError::typ().with_message(msg)
}

/// A callback argument that is not callable (`[].map(5)`).
pub(crate) fn callback_not_function(value: &JsValue) -> JsNativeError {
    JsNativeError::typ().with_message(format!("{} is not a function", describe_value(value)))
}

/// A name that does not resolve to a value: undeclared ("x is not
/// defined") or declared but not yet initialized (V8's TDZ wording).
pub(crate) fn unresolved(locator: &boa_ast::scope::BindingLocator, name: String) -> JsNativeError {
    if locator.is_global() {
        JsNativeError::reference().with_message(format!("{name} is not defined"))
    } else {
        JsNativeError::reference().with_message(format!("Cannot access '{name}' before initialization"))
    }
}

/// The message text of a native error, for sites that need a string.
pub(crate) trait MessageText {
    fn to_string_message(&self) -> String;
}

impl MessageText for JsNativeError {
    fn to_string_message(&self) -> String {
        self.message().to_string()
    }
}

/// A call of a non-callable value from inside the engine (not at a call
/// site the program wrote).
pub(crate) fn not_callable_inner(value: &JsValue) -> JsNativeError {
    JsNativeError::typ().with_message(format!("{} is not a function", describe_value(value)))
}

/// `new` of a non-constructor from inside the engine.
pub(crate) fn not_constructor_inner(value: &JsValue) -> JsNativeError {
    JsNativeError::typ().with_message(format!("{} is not a constructor", describe_value(value)))
}

/// A pattern the regex engine rejects, worded as V8 words it.
pub(crate) fn regexp_error(pattern: &crate::JsString, flags: &crate::JsString, text: &str) -> JsNativeError {
    let p = pattern.to_std_string_escaped();
    let f = flags.to_std_string_escaped();
    let opens = p.matches('(').count().saturating_sub(p.matches("\\(").count());
    let closes = p.matches(')').count().saturating_sub(p.matches("\\)").count());
    let reason = match text {
        "Unbalanced bracket" => {
            if p.contains('[') { "Unterminated character class" } else { "Lone quantifier brackets" }
        }
        "Unbalanced parenthesis" => {
            if opens > closes { "Unterminated group" } else { "Unmatched ')'" }
        }
        "Quantifier not allowed here" | "Invalid quantifier" => "Nothing to repeat",
        "Invalid braced quantifier" => "numbers out of order in {} quantifier",
        "Invalid character range" => "Range out of order in character class",
        t if t.starts_with("Range values reversed") => "Range out of order in character class",
        "Invalid atom character" if p.contains("**") || p.contains("+*") || p.contains("?*") || p.starts_with(['*', '+', '?', '{']) => "Nothing to repeat",
        "Incomplete escape" | "Unterminated escape" => "\\ at end of pattern",
        "Invalid named backreference syntax" => "Invalid named capture referenced",
        "Invalid unicode escape" => "Invalid Unicode escape",
        "Invalid property escape" => "Invalid property name",
        "Invalid group modifier" => "Invalid group",
        other => other,
    };
    JsNativeError::syntax().with_message(format!("Invalid regular expression: /{p}/{f}: {reason}"))
}
