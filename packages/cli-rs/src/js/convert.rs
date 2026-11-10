//! Convert JS values to JSON values, keeping JS key order.
//!
//! Plain data converts as `JSON.parse(JSON.stringify(x))` would see it, except
//! that values JSON would drop or mangle become marker objects with a `__js`
//! key, so callers can tell them apart:
//!
//! | JS value              | JSON value                                         |
//! | --------------------- | -------------------------------------------------- |
//! | function / class      | `{"__js": "function", "name": <fn.name>, "id": N}` |
//! | `undefined`           | `{"__js": "undefined"}`                            |
//! | NaN, ±Infinity        | `{"__js": "number", "value": "NaN" \| "Infinity" \| "-Infinity"}` |
//! | symbol                | `{"__js": "symbol", "description": <string or null>}` |
//! | bigint                | `{"__js": "bigint", "value": "<decimal>"}`         |
//! | Date                  | `{"__js": "date", "iso": <toISOString or null>}`   |
//! | RegExp                | `{"__js": "regexp", "source": ..., "flags": ...}`  |
//! | Error                 | `{"__js": "error", "name": ..., "message": ...}`   |
//! | Map                   | `{"__js": "map", "entries": [[k, v], ...]}`        |
//! | Set                   | `{"__js": "set", "values": [...]}`                 |
//! | Promise               | `{"__js": "promise"}`                              |
//! | a cycle back-edge     | `{"__js": "circular"}`                             |
//!
//! A function's `id` is the same number for the same function object for
//! the life of the thread's engine (identity, as `===` sees it).
//!
//! Objects list their own enumerable string keys (`Object.keys` order, read
//! through getters). Array holes convert to `{"__js": "undefined"}`.
//! `-0` converts to `0`. Use [`super::to_json_data`] for `JSON.stringify`
//! semantics.

use crate::json::{Map, Number, Value};
use boa_engine::object::builtins::{JsArray, JsDate, JsMap, JsPromise, JsRegExp, JsSet};
use boa_engine::value::JsVariant;
use boa_engine::{js_string, Context, JsObject, JsResult, JsValue};

pub fn marker(kind: &str) -> Value {
    let mut m = Map::new();
    m.insert("__js".into(), Value::String(kind.into()));
    Value::Object(m)
}

fn marker_with(kind: &str, fields: &[(&str, Value)]) -> Value {
    let mut m = Map::new();
    m.insert("__js".into(), Value::String(kind.into()));
    for (k, v) in fields {
        m.insert((*k).into(), v.clone());
    }
    Value::Object(m)
}

pub fn number(n: f64) -> Value {
    if n.is_nan() {
        return marker_with("number", &[("value", Value::String("NaN".into()))]);
    }
    if n.is_infinite() {
        let s = if n > 0.0 { "Infinity" } else { "-Infinity" };
        return marker_with("number", &[("value", Value::String(s.into()))]);
    }
    if n == 0.0 {
        return Value::Number(Number::from(0));
    }
    if n.fract() == 0.0 && n.abs() < 9_007_199_254_740_992.0 {
        return Value::Number(Number::from(n as i64));
    }
    Number::from_f64(n).map(Value::Number).unwrap_or(Value::Null)
}

pub struct Converter {
    keys: JsObject,
    fn_id: JsObject,
    is_error: JsObject,
    stack: Vec<JsObject>,
}

impl Converter {
    pub fn new(context: &mut Context) -> JsResult<Self> {
        let keys = context
            .eval(boa_engine::Source::from_bytes("Object.keys"))?
            .as_object()
            .expect("Object.keys");
        let is_error = context
            .eval(boa_engine::Source::from_bytes(
                "(v) => Object.prototype.toString.call(v) === '[object Error]'",
            ))?
            .as_object()
            .expect("is_error");
        let fn_id = context
            .eval(boa_engine::Source::from_bytes(
                "(() => { const ids = new WeakMap(); let next = 0; return f => { let id = ids.get(f); if (id === undefined) { id = ++next; ids.set(f, id); } return id; }; })()",
            ))?
            .as_object()
            .expect("fn_id");
        Ok(Self { keys, fn_id, is_error, stack: Vec::new() })
    }

    pub fn convert(&mut self, value: &JsValue, context: &mut Context) -> JsResult<Value> {
        Ok(match value.variant() {
            JsVariant::Null => Value::Null,
            JsVariant::Undefined => marker("undefined"),
            JsVariant::Boolean(b) => Value::Bool(b),
            JsVariant::String(s) => Value::String(s.to_std_string_lossy()),
            JsVariant::Float64(n) => number(n),
            JsVariant::Integer32(n) => Value::Number(Number::from(n)),
            JsVariant::BigInt(b) => marker_with("bigint", &[("value", Value::String(b.to_string()))]),
            JsVariant::Symbol(s) => marker_with(
                "symbol",
                &[(
                    "description",
                    s.description()
                        .map(|d| Value::String(d.to_std_string_lossy()))
                        .unwrap_or(Value::Null),
                )],
            ),
            JsVariant::Object(obj) => self.convert_object(&obj, context)?,
        })
    }

    fn convert_object(&mut self, obj: &JsObject, context: &mut Context) -> JsResult<Value> {
        if obj.is_callable() {
            let name = obj.get(js_string!("name"), context)?;
            let name = match name.as_string() {
                Some(s) => Value::String(s.to_std_string_lossy()),
                None => Value::String(String::new()),
            };
            let id = self.fn_id.call(&JsValue::undefined(), &[obj.clone().into()], context)?;
            let id = number(id.as_number().unwrap_or(0.0));
            return Ok(marker_with("function", &[("name", name), ("id", id)]));
        }
        if self.stack.iter().any(|o| JsObject::equals(o, obj)) {
            return Ok(marker("circular"));
        }
        if let Ok(date) = JsDate::from_object(obj.clone()) {
            let t = date.get_time(context)?;
            let iso = if t.as_number().map(|n| n.is_nan()).unwrap_or(true) {
                Value::Null
            } else {
                Value::String(date.to_iso_string(context)?.to_string(context)?.to_std_string_lossy())
            };
            return Ok(marker_with("date", &[("iso", iso)]));
        }
        if let Ok(re) = JsRegExp::from_object(obj.clone()) {
            let source = obj.get(js_string!("source"), context)?.to_string(context)?;
            let flags = re.flags(context)?;
            return Ok(marker_with(
                "regexp",
                &[
                    ("source", Value::String(source.to_std_string_lossy())),
                    ("flags", Value::String(flags)),
                ],
            ));
        }
        if JsPromise::from_object(obj.clone()).is_ok() {
            return Ok(marker("promise"));
        }
        if self
            .is_error
            .call(&JsValue::undefined(), &[obj.clone().into()], context)?
            .to_boolean()
        {
            let name = obj.get(js_string!("name"), context)?.to_string(context)?;
            let message = obj.get(js_string!("message"), context)?.to_string(context)?;
            return Ok(marker_with(
                "error",
                &[
                    ("name", Value::String(name.to_std_string_lossy())),
                    ("message", Value::String(message.to_std_string_lossy())),
                ],
            ));
        }
        self.stack.push(obj.clone());
        let result = self.convert_container(obj, context);
        self.stack.pop();
        result
    }

    fn convert_container(&mut self, obj: &JsObject, context: &mut Context) -> JsResult<Value> {
        if let Ok(map) = JsMap::from_object(obj.clone()) {
            let mut entries = Vec::new();
            let mut pairs = Vec::new();
            map.for_each_native(|k, v| {
                pairs.push((k, v));
                Ok(())
            })?;
            for (k, v) in pairs {
                entries.push(Value::Array(vec![self.convert(&k, context)?, self.convert(&v, context)?]));
            }
            return Ok(marker_with("map", &[("entries", Value::Array(entries))]));
        }
        if let Ok(set) = JsSet::from_object(obj.clone()) {
            let mut items = Vec::new();
            set.for_each_native(|v| {
                items.push(v);
                Ok(())
            })?;
            let mut values = Vec::new();
            for v in items {
                values.push(self.convert(&v, context)?);
            }
            return Ok(marker_with("set", &[("values", Value::Array(values))]));
        }
        if obj.is_array() {
            let arr = JsArray::from_object(obj.clone())?;
            let len = arr.length(context)?;
            let mut out = Vec::with_capacity(len as usize);
            for i in 0..len {
                let v = obj.get(i, context)?;
                out.push(self.convert(&v, context)?);
            }
            return Ok(Value::Array(out));
        }
        let keys = self.keys.call(&JsValue::undefined(), &[obj.clone().into()], context)?;
        let keys = JsArray::from_object(keys.as_object().expect("keys array"))?;
        let len = keys.length(context)?;
        let mut out = Map::new();
        for i in 0..len {
            let k = keys.get(i, context)?;
            let ks = k.to_string(context)?;
            let v = obj.get(ks.clone(), context)?;
            let cv = self.convert(&v, context)?;
            out.insert(ks.to_std_string_lossy(), cv);
        }
        Ok(Value::Object(out))
    }
}

/// Apply `JSON.stringify` semantics to a converted value: drop object keys
/// whose value is undefined, a function or a symbol; turn those into `null`
/// inside arrays; non-finite numbers become `null`; dates become their ISO
/// string; maps, sets, regexps and errors become `{}`.
pub fn to_json_data(value: &Value) -> Option<Value> {
    match value {
        Value::Object(m) => {
            if let Some(kind) = m.get("__js").and_then(|k| k.as_str()) {
                return match kind {
                    "undefined" | "function" | "symbol" => None,
                    "number" => Some(Value::Null),
                    "date" => Some(m.get("iso").cloned().unwrap_or(Value::Null)),
                    "circular" | "bigint" => None,
                    _ => Some(Value::Object(Map::new())),
                };
            }
            let mut out = Map::new();
            for (k, v) in m {
                if let Some(v) = to_json_data(v) {
                    out.insert(k.clone(), v);
                }
            }
            Some(Value::Object(out))
        }
        Value::Array(items) => Some(Value::Array(
            items.iter().map(|v| to_json_data(v).unwrap_or(Value::Null)).collect(),
        )),
        other => Some(other.clone()),
    }
}
