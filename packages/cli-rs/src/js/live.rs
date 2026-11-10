//! Live JS values for callers that must keep objects across calls (theme
//! build: core's `defineTheme` result goes into `generateThemeRulesSplit`
//! with an array the generator fills). The caller drives Boa directly.

use super::engine::{with_engine, Engine, Settled};
use super::{ImportOptions, JsError};
use boa_engine::object::builtins::JsPromise;
use boa_engine::{Context, JsObject, JsValue};
use std::path::Path;

pub struct LiveSession<'a> {
    engine: &'a mut Engine,
}

/// Run `f` with the thread's engine.
pub fn with_live<R>(f: impl FnOnce(&mut LiveSession) -> R) -> R {
    with_engine(|engine| f(&mut LiveSession { engine }))
}

impl LiveSession<'_> {
    pub fn ctx(&mut self) -> &mut Context {
        &mut self.engine.ctx
    }

    /// Import a module (as `import_module` does) and return its live
    /// namespace object.
    pub fn import(&mut self, path: &Path, opts: &ImportOptions) -> Result<JsObject, JsError> {
        let (module, _, _) = self.engine.load(path, opts)?;
        Ok(module.namespace(&mut self.engine.ctx))
    }

    /// Import through jiti (`JitiOptions`) and return the live namespace.
    pub fn import_jiti(&mut self, path: &Path, opts: &ImportOptions, jiti: &super::JitiOptions) -> Result<JsObject, JsError> {
        let (module, _, _) = self.engine.load_with(path, opts, jiti)?;
        Ok(module.namespace(&mut self.engine.ctx))
    }

    /// Await `value` when it is a promise (running jobs and timers).
    pub fn settle(&mut self, value: JsValue, file: &Path) -> Result<JsValue, JsError> {
        let Some(p) = value.as_object().and_then(|o| JsPromise::from_object(o.clone()).ok()) else {
            let _ = self.engine.ctx.run_jobs();
            return Ok(value);
        };
        match self.engine.settle(&p, None) {
            Settled::Fulfilled(v) => Ok(v),
            Settled::Rejected(e) => Err(super::engine::error_fields(&e, file, &mut self.engine.ctx)),
            Settled::Timeout | Settled::Unsettled => Err(JsError {
                name: "Error".into(),
                message: "Promise never settled".into(),
                code: None,
                file: file.to_path_buf(),
            }),
        }
    }

    /// A thrown Boa error as the JS CLI would see it.
    pub fn error(&mut self, err: boa_engine::JsError, file: &Path) -> JsError {
        self.engine.to_js_error(err, file)
    }
}

impl LiveSession<'_> {
    /// Convert a live value with the marker rules of `convert.rs`.
    pub fn to_value(&mut self, value: &JsValue) -> Result<crate::json::Value, String> {
        let ctx = &mut self.engine.ctx;
        let mut conv = super::convert::Converter::new(ctx).map_err(|e| e.to_string())?;
        conv.convert(value, ctx).map_err(|e| e.to_string())
    }

    /// `obj[key]`.
    pub fn get(&mut self, obj: &JsObject, key: &str) -> JsValue {
        obj.get(boa_engine::JsString::from(key), &mut self.engine.ctx).unwrap_or_default()
    }

    /// Call `func` with `args` (`this` undefined) and await a promise result.
    /// A throw comes back as the thrown value.
    pub fn call(&mut self, func: &JsValue, args: &[JsValue]) -> Result<JsValue, JsValue> {
        let Some(f) = func.as_object().filter(|o| o.is_callable()) else {
            return Err(JsValue::undefined());
        };
        let r = f.call(&JsValue::undefined(), args, &mut self.engine.ctx);
        match r {
            Err(e) => Err(e.into_opaque(&mut self.engine.ctx).unwrap_or_default()),
            Ok(v) => match v.as_object().and_then(|o| JsPromise::from_object(o.clone()).ok()) {
                None => {
                    let _ = self.engine.ctx.run_jobs();
                    Ok(v)
                }
                Some(p) => match self.engine.settle(&p, None) {
                    Settled::Fulfilled(v) => Ok(v),
                    Settled::Rejected(e) => Err(e),
                    Settled::Timeout | Settled::Unsettled => Err(JsValue::undefined()),
                },
            },
        }
    }

    /// A global binding, e.g. `Object`.
    pub fn global(&mut self, name: &str) -> JsValue {
        let g = self.engine.ctx.global_object();
        g.get(boa_engine::JsString::from(name), &mut self.engine.ctx).unwrap_or_default()
    }

    /// `err instanceof Error ? err.message : null`, read loosely: the thrown
    /// value's `message` when it is an Error object.
    pub fn error_message(&mut self, thrown: &JsValue) -> Option<String> {
        let obj = thrown.as_object()?;
        if !obj.is::<boa_engine::builtins::error::Error>() {
            return None;
        }
        let m = obj.get(boa_engine::js_string!("message"), &mut self.engine.ctx).ok()?;
        Some(m.to_string(&mut self.engine.ctx).ok()?.to_std_string_lossy())
    }

    /// A new empty array.
    pub fn new_array(&mut self) -> JsValue {
        boa_engine::object::builtins::JsArray::new(&mut self.engine.ctx).map(Into::into).unwrap_or_default()
    }

    /// The string items of an array.
    pub fn string_items(&mut self, arr: &JsValue) -> Vec<String> {
        let Some(o) = arr.as_object() else { return vec![] };
        let Ok(a) = boa_engine::object::builtins::JsArray::from_object(o.clone()) else { return vec![] };
        let n = a.length(&mut self.engine.ctx).unwrap_or(0);
        (0..n)
            .filter_map(|i| {
                let v = a.get(i, &mut self.engine.ctx).ok()?;
                Some(v.to_string(&mut self.engine.ctx).ok()?.to_std_string_lossy())
            })
            .collect()
    }

    /// `String(v)`.
    pub fn string(&mut self, v: &JsValue) -> String {
        v.to_string(&mut self.engine.ctx).map(|s| s.to_std_string_lossy()).unwrap_or_default()
    }
}

impl LiveSession<'_> {
    /// Register `obj` as a synthetic module (`JitiOptions::virtual_modules`).
    pub fn register_virtual(&mut self, obj: JsObject) -> Result<u64, String> {
        self.engine.register_virtual(obj).map_err(|e| e.to_string())
    }

    /// A `defineTheme` stand-in that calls `real` and appends
    /// `[input, result]` to `log` (an array).
    pub fn recorder(&mut self, real: JsObject, log: JsObject) -> JsObject {
        boa_engine::object::FunctionObjectBuilder::new(
            self.engine.ctx.realm(),
            boa_engine::NativeFunction::from_copy_closure_with_captures(
                |this, args, (real, log): &(JsObject, JsObject), ctx| {
                    let result = real.call(this, args, ctx)?;
                    let input = args.first().cloned().unwrap_or_default();
                    let pair = boa_engine::object::builtins::JsArray::from_iter([input, result.clone()], ctx);
                    let arr = boa_engine::object::builtins::JsArray::from_object(log.clone())?;
                    arr.push(pair.clone(), ctx)?;
                    // Enumerable, so a spread copy of the theme carries it.
                    if let Some(obj) = result.as_object() {
                        let symbol_ctor = ctx.global_object().get(boa_engine::js_string!("Symbol"), ctx)?;
                        if let Some(sc) = symbol_ctor.as_object() {
                            let for_fn = sc.get(boa_engine::js_string!("for"), ctx)?;
                            if let Some(f) = for_fn.as_object() {
                                let sym = f.call(&symbol_ctor, &[boa_engine::js_string!("astryx.theme.lineage").into()], ctx)?;
                                if let Some(sym) = sym.as_symbol() {
                                    let _ = obj.set(sym, pair, false, ctx);
                                }
                            }
                        }
                    }
                    Ok(result)
                },
                (real, log),
            ),
        )
        .name(boa_engine::js_string!("defineTheme"))
        .length(1)
        .build()
        .into()
    }

    /// `{...ns, [key]: value}`.
    pub fn spread_with(&mut self, ns: &JsObject, key: &str, value: JsValue) -> JsObject {
        let object = self.global("Object");
        let assign = object.as_object().map(|o| self.get(&o, "assign")).unwrap_or_default();
        let empty = boa_engine::object::ObjectInitializer::new(&mut self.engine.ctx).build();
        let copy = self.call(&assign, &[empty.into(), ns.clone().into()]).unwrap_or_default();
        let copy = copy.as_object().unwrap_or_else(|| boa_engine::object::ObjectInitializer::new(&mut self.engine.ctx).build());
        let _ = copy.set(boa_engine::JsString::from(key), value, false, &mut self.engine.ctx);
        copy
    }

    /// `obj[Symbol.for(name)]`.
    pub fn get_symbol_for(&mut self, obj: &JsObject, name: &str) -> JsValue {
        let ctx = &mut self.engine.ctx;
        let symbol_ctor = ctx.global_object().get(boa_engine::js_string!("Symbol"), ctx).unwrap_or_default();
        let Some(sc) = symbol_ctor.as_object() else { return JsValue::undefined() };
        let f = sc.get(boa_engine::js_string!("for"), ctx).unwrap_or_default();
        let Some(f) = f.as_object() else { return JsValue::undefined() };
        let sym = f.call(&symbol_ctor, &[boa_engine::JsString::from(name).into()], ctx).unwrap_or_default();
        match sym.as_symbol() {
            Some(sym) => obj.get(sym, ctx).unwrap_or_default(),
            None => JsValue::undefined(),
        }
    }

    /// `Object.hasOwn(obj, key)`.
    pub fn has_own(&mut self, obj: &JsObject, key: &str) -> bool {
        obj.has_own_property(boa_engine::JsString::from(key), &mut self.engine.ctx).unwrap_or(false)
    }
}
