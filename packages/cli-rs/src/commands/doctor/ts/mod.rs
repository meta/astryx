//! The project's own TypeScript, run in the JS engine the way the JS CLI runs
//! it (`project-typescript.mjs`), and a thin bridge for driving its compiler
//! API from Rust: every check's logic is Rust; only the compiler is JS.

pub mod doc_types;
pub mod type_text;
pub mod type_match;
pub mod package_tsconfig;
pub mod unresolved;

use boa_engine::object::builtins::JsArray;
use boa_engine::object::ObjectInitializer;
use boa_engine::property::Attribute;
use boa_engine::{js_string, Context, JsObject, JsString, JsValue, NativeFunction};
use std::path::Path;

pub const TYPESCRIPT_FIX: &str = "On TypeScript 7, add its TypeScript 6 API package (`npm install -D @typescript/typescript6`); otherwise install TypeScript 5.0 through 6 (`npm install -D typescript@6`). Then run this check again.";

/// `unusableTypeScriptReason(version, outcome)`.
pub fn unusable_reason(version: &str, outcome: &str) -> String {
    format!(
        "TypeScript {version} is installed in this project, but it has no JavaScript compiler API (`createProgram`) to read types with (TypeScript 7 ships none), so {outcome}. {TYPESCRIPT_FIX}"
    )
}

/// Where Node's `createRequire(<dir>/package.json)` finds `name`: the
/// package directory, walking up `node_modules` folders.
fn require_package_dir(dir: &str, name: &str) -> Option<String> {
    let mut d = crate::discovery::nodepath::resolve1(dir);
    loop {
        if !d.ends_with("/node_modules") {
            let candidate = crate::discovery::nodepath::join(&[&d, "node_modules", name]);
            if crate::discovery::nodepath::exists(&crate::discovery::nodepath::join2(&candidate, "package.json")) {
                return Some(candidate);
            }
        }
        let parent = crate::discovery::nodepath::dirname(&d);
        if parent == d {
            return None;
        }
        d = parent;
    }
}

/// A package's main module as `require` resolves it.
fn main_file(pkg_dir: &str) -> Option<String> {
    let pj = crate::discovery::nodepath::read_json(&crate::discovery::nodepath::join2(pkg_dir, "package.json"))?;
    let main = pj.get("main").and_then(|m| m.as_str()).unwrap_or("index.js");
    let base = crate::discovery::nodepath::resolve(&[pkg_dir, main]);
    [base.clone(), format!("{base}.js"), crate::discovery::nodepath::join2(&base, "index.js")]
        .into_iter()
        .find(|f| std::fs::metadata(f).map(|m| m.is_file()).unwrap_or(false))
}

fn package_version(pkg_dir: &str) -> Option<String> {
    crate::discovery::nodepath::read_json(&crate::discovery::nodepath::join2(pkg_dir, "package.json"))
        .and_then(|p| p.get("version").and_then(|v| v.as_str()).map(String::from))
        .filter(|v| !v.is_empty())
}

/// What `resolveProjectTypeScript(dirs)` finds, before it is loaded.
pub enum Found {
    /// A module to load (`require('typescript')` or the TypeScript 6 API).
    Module { file: String },
    /// Installed with no loadable compiler API: its version.
    Unusable(String),
}

/// `resolveProjectTypeScript(dirs)`, as far as the file system says.
pub fn find_typescript(dirs: &[&str]) -> Option<Found> {
    let mut unusable: Option<String> = None;
    for dir in dirs.iter().filter(|d| !d.is_empty()) {
        if let Some(pd) = require_package_dir(dir, "typescript") {
            if let Some(file) = main_file(&pd) {
                return Some(Found::Module { file });
            }
            if unusable.is_none() {
                unusable = package_version(&pd);
            }
        }
        if let Some(pd) = require_package_dir(dir, "@typescript/typescript6") {
            if let Some(file) = main_file(&pd) {
                return Some(Found::Module { file });
            }
        }
    }
    unusable.map(Found::Unusable)
}

/// The JS side: the loaded `ts` module.
pub struct Ts<'c> {
    pub ctx: &'c mut Context,
    pub ts: JsObject,
}

/// Run `f` with the project's TypeScript loaded, or report why it is not:
/// `Err(None)` when it is not installed, `Err(Some(version))` when it has no
/// compiler API.
pub fn with_typescript<R>(dirs: &[&str], f: impl FnOnce(&mut Ts, &str) -> R) -> Result<R, Option<String>> {
    let found = find_typescript(dirs);
    let file = match found {
        None => return Err(None),
        Some(Found::Unusable(v)) => return Err(Some(v)),
        Some(Found::Module { file }) => file,
    };
    crate::js::live::with_live(|live| {
        let ns = match live.import(Path::new(&file), &Default::default()) {
            Ok(ns) => ns,
            Err(_) => return Err(None),
        };
        let module = live.get(&ns, "default");
        let Some(ts) = module.as_object() else { return Err(None) };
        let create = live.get(&ts, "createProgram");
        if !create.as_object().map(|o| o.is_callable()).unwrap_or(false) {
            let pd = crate::discovery::nodepath::dirname(&crate::discovery::nodepath::dirname(&file));
            return Err(package_version(&pd));
        }
        let version = live.get(&ts, "version");
        let version = live.string(&version);
        let mut t = Ts { ctx: live.ctx(), ts };
        Ok(f(&mut t, &version))
    })
}

impl Ts<'_> {
    pub fn get(&mut self, v: &JsValue, key: &str) -> JsValue {
        match v.as_object() {
            Some(o) => o.get(JsString::from(key), self.ctx).unwrap_or_default(),
            None => JsValue::undefined(),
        }
    }
    pub fn get_i(&mut self, v: &JsValue, i: usize) -> JsValue {
        match v.as_object() {
            Some(o) => o.get(i, self.ctx).unwrap_or_default(),
            None => JsValue::undefined(),
        }
    }
    pub fn set(&mut self, v: &JsValue, key: &str, value: JsValue) {
        if let Some(o) = v.as_object() {
            let _ = o.set(JsString::from(key), value, true, self.ctx);
        }
    }
    /// `v[method](...args)`; a throw is `Err`.
    pub fn call(&mut self, v: &JsValue, method: &str, args: &[JsValue]) -> Result<JsValue, JsValue> {
        let f = self.get(v, method);
        let Some(fo) = f.as_object().filter(|o| o.is_callable()) else { return Err(JsValue::undefined()) };
        fo.call(v, args, self.ctx).map_err(|e| e.into_opaque(self.ctx).unwrap_or_default())
    }
    /// `v[method](...args)`, `undefined` on a throw.
    pub fn m(&mut self, v: &JsValue, method: &str, args: &[JsValue]) -> JsValue {
        self.call(v, method, args).unwrap_or_default()
    }
    /// `ts[name](...args)`.
    pub fn f(&mut self, name: &str, args: &[JsValue]) -> JsValue {
        let ts: JsValue = self.ts.clone().into();
        self.m(&ts, name, args)
    }
    /// `ts[name]?.(node)` as a boolean.
    pub fn is(&mut self, name: &str, node: &JsValue) -> bool {
        let ts: JsValue = self.ts.clone().into();
        let f = self.get(&ts, name);
        if !f.as_object().map(|o| o.is_callable()).unwrap_or(false) {
            return false;
        }
        self.m(&ts, name, std::slice::from_ref(node)).to_boolean()
    }
    /// `ts[group][name]`, a number (`ts.SyntaxKind.ExportKeyword`).
    pub fn enum_value(&mut self, group: &str, name: &str) -> f64 {
        let ts: JsValue = self.ts.clone().into();
        let g = self.get(&ts, group);
        self.get(&g, name).as_number().unwrap_or(f64::NAN)
    }
    pub fn kind(&mut self, node: &JsValue) -> f64 {
        self.get(node, "kind").as_number().unwrap_or(f64::NAN)
    }
    pub fn s(&mut self, v: &JsValue) -> String {
        if v.is_undefined() || v.is_null() {
            return String::new();
        }
        v.to_string(self.ctx).map(|s| s.to_std_string_lossy()).unwrap_or_default()
    }
    pub fn opt_s(&mut self, v: &JsValue) -> Option<String> {
        v.as_string().map(|s| s.to_std_string_lossy())
    }
    pub fn n(&mut self, v: &JsValue) -> f64 {
        v.as_number().unwrap_or(f64::NAN)
    }
    pub fn items(&mut self, v: &JsValue) -> Vec<JsValue> {
        let Some(o) = v.as_object() else { return vec![] };
        let len = o.get(js_string!("length"), self.ctx).ok().and_then(|l| l.as_number()).unwrap_or(0.0) as usize;
        (0..len).map(|i| o.get(i, self.ctx).unwrap_or_default()).collect()
    }
    pub fn str(&self, s: &str) -> JsValue {
        JsString::from(s).into()
    }
    pub fn num(&self, n: f64) -> JsValue {
        JsValue::from(n)
    }
    pub fn arr(&mut self, items: Vec<JsValue>) -> JsValue {
        JsArray::from_iter(items, self.ctx).into()
    }
    pub fn obj(&mut self, props: Vec<(&str, JsValue)>) -> JsValue {
        let mut init = ObjectInitializer::new(self.ctx);
        for (k, v) in props {
            init.property(JsString::from(k), v, Attribute::all());
        }
        init.build().into()
    }
    /// A JS function backed by Rust, with captured JS state.
    pub fn func<C: boa_engine::Trace + boa_engine::Finalize + 'static>(
        &mut self,
        captures: C,
        f: fn(&JsValue, &[JsValue], &C, &mut Context) -> boa_engine::JsResult<JsValue>,
    ) -> JsValue {
        let nf = NativeFunction::from_copy_closure_with_captures(f, captures);
        boa_engine::object::FunctionObjectBuilder::new(self.ctx.realm(), nf).build().into()
    }
    /// `Object.assign({}, ...parts)`.
    pub fn assign(&mut self, parts: Vec<JsValue>) -> JsValue {
        let global: JsValue = self.ctx.global_object().into();
        let object = self.get(&global, "Object");
        let mut args = vec![self.obj(vec![])];
        args.extend(parts);
        self.m(&object, "assign", &args)
    }
    /// `node.getStart(sf)`.
    pub fn start(&mut self, node: &JsValue, sf: &JsValue) -> f64 {
        let v = self.m(node, "getStart", std::slice::from_ref(sf));
        self.n(&v)
    }
    pub fn end(&mut self, node: &JsValue) -> f64 {
        let v = self.get(node, "end");
        self.n(&v)
    }
    /// The children `ts.forEachChild` visits, in order.
    pub fn children(&mut self, node: &JsValue) -> Vec<JsValue> {
        let collected = JsArray::new(self.ctx).expect("array");
        let cb = self.func(collected.clone(), |_, args, arr, ctx| {
            let v = args.first().cloned().unwrap_or_default();
            let _ = arr.push(v, ctx);
            Ok(JsValue::undefined())
        });
        let ts: JsValue = self.ts.clone().into();
        let _ = self.call(&ts, "forEachChild", &[node.clone(), cb]);
        let v: JsValue = collected.into();
        self.items(&v)
    }
    /// Identity of two JS values (`===` for objects).
    pub fn same(&self, a: &JsValue, b: &JsValue) -> bool {
        match (a.as_object(), b.as_object()) {
            (Some(x), Some(y)) => JsObject::equals(&x, &y),
            _ => false,
        }
    }
    pub fn truthy(&self, v: &JsValue) -> bool {
        v.to_boolean()
    }
}
