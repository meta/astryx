//! The Boa engine behind `crate::js`: one context per thread, a module
//! loader that resolves as Node (or jiti) does, and the host functions the
//! builtin shims call.

use super::convert::Converter;
use super::resolve::{self, Mode, Resolved};
use super::call::{CallError, CallOptions, CallResult};
use super::prune::{self, Wanted};
use super::{builtins, transform, ImportOptions, JitiOptions, JsError, Namespace};
use std::collections::BTreeSet;
use boa_engine::builtins::promise::PromiseState;
use boa_engine::module::{ModuleLoader, ModuleRequest, Referrer};
use boa_engine::object::builtins::{JsArray, JsPromise};
use boa_engine::object::ObjectInitializer;
use boa_engine::property::Attribute;
use boa_engine::{
    js_string, Context, JsNativeError, JsObject, JsResult, JsString, JsValue, Module,
    NativeFunction, Source,
};
use std::cell::RefCell;
use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::rc::Rc;

/// Load timing and engine start-up phases on stderr (`--features js-trace`).
const TRACE: bool = cfg!(feature = "js-trace");

thread_local! {
    // Never dropped: Boa's collector lives in its own thread-local, which may
    // be gone by the time this one is destroyed.
    static ENGINE: RefCell<Option<std::mem::ManuallyDrop<Engine>>> = const { RefCell::new(None) };
    /// `Some` while output is captured; `None` writes straight to stderr.
    static CAPTURE: RefCell<Option<Vec<u8>>> = const { RefCell::new(None) };
    /// `Some` while console calls are captured as (level, text).
    static CONSOLE: RefCell<Option<Vec<(String, String)>>> = const { RefCell::new(None) };
    /// Every module file loaded, in load order, while recording.
    static LOADED: RefCell<Option<Vec<PathBuf>>> = const { RefCell::new(None) };
    static VIRTUAL_IDS: std::cell::Cell<u64> = const { std::cell::Cell::new(0) };
    static GENERATIONS: std::cell::Cell<u32> = const { std::cell::Cell::new(0) };
    /// Source text to use in place of a file's, for the load in progress.
    static OVERRIDES: RefCell<Vec<(PathBuf, String)>> = const { RefCell::new(Vec::new()) };
    /// The flavor of the call in progress, for imports with no module
    /// referrer (dynamic `import()` from a promise job).
    static CALL_FLAVOR: std::cell::Cell<Option<Flavor>> = const { std::cell::Cell::new(None) };
    /// Whether the timer globals were installed (nothing to wait on before).
    static TIMERS_LOADED: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
    /// Resolution failure message -> the specifier that failed.
    static MISSING: RefCell<HashMap<String, String>> = RefCell::new(HashMap::new());
    /// The code `process.exit` was called with, until the caller reads it.
    static EXIT: std::cell::Cell<Option<i32>> = const { std::cell::Cell::new(None) };
    static EPOCH: std::time::Instant = std::time::Instant::now();
    static MATH: RefCell<Vec<(&'static str, super::MathFn)>> = const { RefCell::new(Vec::new()) };
    /// The loader, for `require` (the engine is borrowed while code runs).
    static LOADER: RefCell<Option<Rc<Loader>>> = const { RefCell::new(None) };
}

const EXIT_MESSAGE: &str = "process.exit() was called";

fn now_ms() -> f64 {
    EPOCH.with(|e| e.elapsed().as_secs_f64() * 1000.0)
}

pub fn with_engine<R>(f: impl FnOnce(&mut Engine) -> R) -> R {
    ENGINE.with(|cell| {
        let mut slot = cell.borrow_mut();
        if slot.is_none() {
            *slot = Some(std::mem::ManuallyDrop::new(Engine::new()));
        }
        f(&mut *slot.as_mut().unwrap())
    })
}

/// Write module output. The JS CLI sends a loading module's stdout to stderr.
pub fn write_output(bytes: &[u8]) {
    CAPTURE.with(|c| match c.borrow_mut().as_mut() {
        Some(buf) => buf.extend_from_slice(bytes),
        None => {
            let mut err = std::io::stderr().lock();
            let _ = err.write_all(bytes);
            let _ = err.flush();
        }
    });
}

pub fn override_math(name: &'static str, f: super::MathFn) {
    MATH.with(|m| {
        let mut m = m.borrow_mut();
        m.retain(|(n, _)| *n != name);
        m.push((name, f));
    });
    ENGINE.with(|cell| {
        if let Some(e) = cell.borrow_mut().as_mut() {
            install_math_fn(&mut e.ctx, name, f);
        }
    });
}

/// `String.prototype.localeCompare` with ICU root collation, as Node's
/// default (en-US) collation orders.
fn install_locale_compare(ctx: &mut Context) {
    let string = ctx.global_object().get(js_string!("String"), ctx).expect("String");
    let proto = string.as_object().unwrap().get(js_string!("prototype"), ctx).expect("prototype");
    let proto = proto.as_object().unwrap();
    let func = boa_engine::object::FunctionObjectBuilder::new(
        ctx.realm(),
        NativeFunction::from_fn_ptr(|this, args, ctx| {
            if this.is_null_or_undefined() {
                return Err(JsNativeError::typ()
                    .with_message("String.prototype.localeCompare called on null or undefined")
                    .into());
            }
            let a = this.to_string(ctx)?.to_std_string_lossy();
            let b = args.first().cloned().unwrap_or_default().to_string(ctx)?.to_std_string_lossy();
            Ok(match crate::text::collate::locale_compare(&a, &b) {
                std::cmp::Ordering::Less => -1,
                std::cmp::Ordering::Equal => 0,
                std::cmp::Ordering::Greater => 1,
            }
            .into())
        }),
    )
    .name(js_string!("localeCompare"))
    .length(1)
    .build();
    proto
        .define_property_or_throw(
            js_string!("localeCompare"),
            boa_engine::property::PropertyDescriptor::builder()
                .value(func)
                .writable(true)
                .enumerable(false)
                .configurable(true),
            ctx,
        )
        .expect("define localeCompare");
}

/// A missing argument is `undefined`, which `ToNumber` makes NaN.
fn arg(a: &[f64], i: usize) -> f64 {
    a.get(i).copied().unwrap_or(f64::NAN)
}

fn install_math_fn(ctx: &mut Context, name: &'static str, f: super::MathFn) {
    let math = ctx.global_object().get(js_string!("Math"), ctx).expect("Math");
    let math = math.as_object().expect("Math object");
    let length = match name {
        "atan2" | "pow" | "imul" => 2,
        "hypot" | "max" | "min" => 2,
        _ => 1,
    };
    let func = boa_engine::object::FunctionObjectBuilder::new(
        ctx.realm(),
        NativeFunction::from_copy_closure(move |_, args, ctx| {
            let mut nums = Vec::with_capacity(args.len());
            for a in args {
                nums.push(a.to_number(ctx)?);
            }
            Ok(JsValue::from(f(&nums)))
        }),
    )
    .name(JsString::from(name))
    .length(length)
    .build();
    math.define_property_or_throw(
        JsString::from(name),
        boa_engine::property::PropertyDescriptor::builder()
            .value(func)
            .writable(true)
            .enumerable(false)
            .configurable(true),
        ctx,
    )
    .expect("define Math function");
}

pub fn set_console_capture(on: bool) -> Vec<(String, String)> {
    CONSOLE.with(|c| {
        let mut c = c.borrow_mut();
        let old = c.take().unwrap_or_default();
        if on {
            *c = Some(Vec::new());
        }
        old
    })
}

pub fn set_load_recording(on: bool) -> Vec<PathBuf> {
    LOADED.with(|c| {
        let mut c = c.borrow_mut();
        let old = c.take().unwrap_or_default();
        if on {
            *c = Some(Vec::new());
        }
        old
    })
}

pub fn missing_specifier(message: &str) -> Option<String> {
    MISSING.with(|m| m.borrow().get(message).cloned())
}

fn note_missing(message: &str, spec: &str) {
    MISSING.with(|m| {
        m.borrow_mut().insert(message.to_string(), spec.to_string());
    });
}

fn record_load(path: &Path) {
    LOADED.with(|l| {
        if let Some(v) = l.borrow_mut().as_mut() {
            v.push(path.to_path_buf());
        }
    });
}

pub fn set_capture(on: bool) -> Vec<u8> {
    CAPTURE.with(|c| {
        let mut c = c.borrow_mut();
        let old = c.take().unwrap_or_default();
        if on {
            *c = Some(Vec::new());
        }
        old
    })
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct Flavor {
    pub mode: Mode,
    pub jsx: bool,
    /// Index of the load's resolution profile (0: the default).
    pub profile: u16,
    /// JSX compiles for the automatic runtime (`react/jsx-runtime`).
    pub jsx_auto: bool,
    /// Module-cache generation: a fresh jiti load starts a new one, so its
    /// whole graph is read again (jiti `moduleCache: false`). 0: shared.
    pub gen: u32,
}

#[derive(Clone, Debug)]
struct ModInfo {
    flavor: Flavor,
    /// What the module takes from each import specifier.
    usage: Rc<HashMap<String, Wanted>>,
}

impl ModInfo {
    fn new(flavor: Flavor) -> Self {
        Self { flavor, usage: Rc::default() }
    }
}

#[derive(Default)]
pub struct Loader {
    files: RefCell<HashMap<(Flavor, PathBuf), Module>>,
    /// Virtual modules by id.
    virtuals: RefCell<HashMap<u64, Module>>,
    /// Export names by module, for barrel pruning.
    export_cache: RefCell<HashMap<PathBuf, Option<BTreeSet<String>>>>,
    /// Resolution profiles; index 0 is the default.
    profiles: RefCell<Vec<resolve::Profile>>,
    /// Barrels cut down to the names one set of importers takes.
    pruned: RefCell<HashMap<(Flavor, PathBuf, Vec<String>), Module>>,
    builtins: RefCell<HashMap<String, Module>>,
    info: RefCell<HashMap<Module, ModInfo>>,
    /// CommonJS `module` objects by real path (Node's `require.cache`).
    cjs: RefCell<HashMap<(PathBuf, u32), JsObject>>,
}

fn loader() -> Rc<Loader> {
    LOADER.with(|l| l.borrow().clone().expect("engine started"))
}

/// Whether a JS source file is an ES module (else CommonJS), as Node
/// decides: the extension, the package's `"type"`, then the syntax.
fn is_esm_source(path: &Path, text: &str, context: &mut Context) -> bool {
    match path.extension().and_then(|e| e.to_str()) {
        Some("mjs" | "mts") => return true,
        Some("cjs" | "cts") => return false,
        _ => {}
    }
    if let Some((_, pj)) = path.parent().and_then(resolve::nearest_package_json) {
        match pj.get("type").and_then(|t| t.as_str()) {
            Some("module") => return true,
            Some("commonjs") => return false,
            _ => {}
        }
    }
    // No "type": Node tries CommonJS and falls back to ESM on ESM syntax.
    // A statement-start `import`/`export` is the only way ESM syntax shows.
    let esm_like = text.lines().any(|l| {
        let l = l.trim_start();
        (l.starts_with("import") && !l.starts_with("import(")) || l.starts_with("export ")
            || l.starts_with("export{") || l.starts_with("export*")
    }) || text.contains("import.meta");
    if !esm_like {
        return false;
    }
    let wrapped = format!("(function (exports, require, module, __filename, __dirname) {{{text}\n}})");
    if boa_engine::Script::parse(Source::from_bytes(wrapped.as_str()), None, context).is_ok() {
        return false;
    }
    Module::parse(Source::from_bytes(text), None, context).is_ok()
}

/// A JS error value carrying Node's `code`.
fn coded_error(kind: &str, code: &str, message: &str, context: &mut Context) -> boa_engine::JsError {
    let native = match kind {
        "TypeError" => JsNativeError::typ(),
        "SyntaxError" => JsNativeError::syntax(),
        _ => JsNativeError::error(),
    }
    .with_message(message.to_string());
    let obj = native.into_opaque(context);
    if !code.is_empty() {
        let _ = obj.set(js_string!("code"), JsString::from(code), false, context);
    }
    boa_engine::JsError::from_opaque(obj.into())
}

impl Loader {
    fn profile_index(&self, p: &resolve::Profile) -> u16 {
        let mut ps = self.profiles.borrow_mut();
        if ps.is_empty() {
            ps.push(resolve::Profile::default());
        }
        if let Some(i) = ps.iter().position(|x| x == p) {
            return i as u16;
        }
        ps.push(p.clone());
        (ps.len() - 1) as u16
    }

    fn profile(&self, i: u16) -> resolve::Profile {
        self.profiles.borrow().get(i as usize).cloned().unwrap_or_default()
    }

    fn info_of(&self, referrer: &Referrer) -> ModInfo {
        match referrer {
            Referrer::Module(m) => self.info.borrow().get(m).cloned(),
            _ => CALL_FLAVOR.with(|c| c.get()).map(ModInfo::new),
        }
        .unwrap_or_else(|| ModInfo::new(Flavor { mode: Mode::Esm, jsx: false, profile: 0, jsx_auto: false, gen: 0 }))
    }

    fn builtin(&self, name: &str, context: &mut Context) -> JsResult<Module> {
        if let Some(m) = self.builtins.borrow().get(name) {
            return Ok(m.clone());
        }
        let Some(src) = builtins::source(name) else {
            return Err(coded_error(
                "Error",
                "ERR_UNKNOWN_BUILTIN_MODULE",
                &format!("No such built-in module: node:{name}"),
                context,
            ));
        };
        let path = PathBuf::from(format!("/node:{name}"));
        let module = Module::parse(Source::from_bytes(src).with_path(&path), None, context)?;
        self.info
            .borrow_mut()
            .insert(module.clone(), ModInfo::new(Flavor { mode: Mode::Esm, jsx: false, profile: 0, jsx_auto: false, gen: 0 }));
        self.builtins.borrow_mut().insert(name.to_string(), module.clone());
        Ok(module)
    }

    /// Load (parse) a file as a module of the given flavor. `cache` false
    /// makes a new module and leaves the cache as it was.
    pub fn load_file(
        &self,
        path: &Path,
        flavor: Flavor,
        json_attr: bool,
        cache: bool,
        context: &mut Context,
    ) -> JsResult<Module> {
        self.load_file_wanting(path, flavor, json_attr, cache, None, context)
    }

    /// `load_file`, for an importer that takes only `wanted` names: a barrel
    /// of a side-effect-free package loads cut down to them.
    fn load_file_wanting(
        &self,
        path: &Path,
        flavor: Flavor,
        json_attr: bool,
        cache: bool,
        wanted: Option<&BTreeSet<String>>,
        context: &mut Context,
    ) -> JsResult<Module> {
        let wanted = wanted.filter(|_| cache && resolve::package_is_pure(path));
        let pruned_key = wanted.map(|w| (flavor, path.to_path_buf(), w.iter().cloned().collect::<Vec<_>>()));
        if let Some(k) = &pruned_key {
            if let Some(m) = self.pruned.borrow().get(k) {
                return Ok(m.clone());
            }
        }
        let key = (flavor, path.to_path_buf());
        if cache {
            if let Some(m) = self.files.borrow().get(&key) {
                return Ok(m.clone());
            }
        }
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        let url = resolve::path_to_file_url(path);
        let t0 = std::time::Instant::now();
        let _trace = Trace(path, t0);
        let module = match ext {
            "json" => {
                if flavor.mode == Mode::Esm && !json_attr {
                    return Err(coded_error(
                        "TypeError",
                        "ERR_IMPORT_ATTRIBUTE_MISSING",
                        &format!("Module \"{url}\" needs an import attribute of \"type: json\""),
                        context,
                    ));
                }
                let text = read_source(path, context)?;
                record_load(path);
                Module::parse_json(JsString::from(text.as_str()), context)
                    .map_err(|_| json_module_error(path, &text, context))?
            }
            "mjs" | "js" | "cjs" | "ts" | "mts" | "cts" | "tsx" | "jsx" => {
                if flavor.mode == Mode::Esm && matches!(ext, "tsx" | "jsx") {
                    return Err(unknown_extension(ext, path, context));
                }
                let text = read_source(path, context)?;
                let original = text.clone();
                let text = if transform::is_typescript(path) || flavor.jsx || ext == "jsx" {
                    match transform::strip(&text, path, flavor.jsx, flavor.jsx_auto) {
                        Ok(t) => t,
                        Err(m) => {
                            let boa = JsNativeError::syntax().with_message(m).into();
                            return Err(syntax_failure(&original, path, flavor, boa, context));
                        }
                    }
                } else {
                    text
                };
                if is_esm_source(path, &text, context) {
                    record_load(path);
                    if let (Some(w), Some(k)) = (wanted, &pruned_key) {
                        let cx = Barrel { loader: self, from: path, flavor };
                        if let Some(cut) = prune::prune_barrel(&text, w, &cx) {
                            let usage = Rc::new(prune::import_usage(&cut));
                            let m = Module::parse(Source::from_bytes(cut.as_str()).with_path(path), None, context)
                                .map_err(|e| syntax_failure(&original, path, flavor, e, context))?;
                            self.info.borrow_mut().insert(m.clone(), ModInfo { flavor, usage });
                            self.pruned.borrow_mut().insert(k.clone(), m.clone());
                            return Ok(m);
                        }
                    }
                    let text = transform::rewrite_pow(&text, true).unwrap_or(text);
                    let usage = Rc::new(prune::import_usage(&text));
                    let text = if flavor.mode == Mode::Jiti {
                        transform::jiti_import_reads(&text).unwrap_or(text)
                    } else {
                        text
                    };
                    let m = Module::parse(Source::from_bytes(text.as_str()).with_path(path), None, context)
                        .map_err(|e| syntax_failure(&original, path, flavor, e, context))?;
                    self.info.borrow_mut().insert(m.clone(), ModInfo { flavor, usage });
                    if cache {
                        self.files.borrow_mut().insert(key, m.clone());
                    }
                    return Ok(m);
                } else {
                    let exports = self.require_cjs(path, Some(text), flavor.mode == Mode::Jiti, flavor.gen, context)?;
                    cjs_namespace(exports, flavor.mode == Mode::Jiti, path, context)?
                }
            }
            _ if flavor.mode == Mode::Jiti && self.profile(flavor.profile).sync => {
                // jiti hands an unknown extension to Node's `require`, which
                // runs it as CommonJS.
                let text = read_source(path, context)?;
                let exports = self.require_cjs(path, Some(text), false, flavor.gen, context)?;
                cjs_namespace(exports, true, path, context)?
            }
            _ => return Err(unknown_extension(ext, path, context)),
        };
        self.info.borrow_mut().entry(module.clone()).or_insert_with(|| ModInfo::new(flavor));
        if cache {
            self.files.borrow_mut().insert(key, module.clone());
        }
        Ok(module)
    }
}

impl Loader {
    /// Run a CommonJS file (once) and return its `module.exports`.
    fn require_cjs(
        &self,
        path: &Path,
        text: Option<String>,
        jiti: bool,
        gen: u32,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        if let Some(m) = self.cjs.borrow().get(&(path.to_path_buf(), gen)) {
            return m.get(js_string!("exports"), context);
        }
        let text = match text {
            Some(t) => t,
            None => {
                let t = read_source(path, context)?;
                if transform::is_typescript(path) {
                    transform::strip(&t, path, false, false)
                        .map_err(|m| coded_error("SyntaxError", "", &m, context))?
                } else {
                    t
                }
            }
        };
        let text = transform::rewrite_pow(&text, false).unwrap_or(text);
        let text = text.strip_prefix("#!").map(|t| t.split_once('\n').map(|x| x.1).unwrap_or("")).unwrap_or(&text).to_string();
        record_load(path);
        let file = path.to_string_lossy().into_owned();
        let dir = path.parent().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
        let exports = JsObject::with_object_proto(context.intrinsics());
        let module = ObjectInitializer::new(context)
            .property(js_string!("id"), JsString::from(file.as_str()), Attribute::all())
            .property(js_string!("path"), JsString::from(dir.as_str()), Attribute::all())
            .property(js_string!("exports"), exports.clone(), Attribute::all())
            .property(js_string!("filename"), JsString::from(file.as_str()), Attribute::all())
            .property(js_string!("loaded"), false, Attribute::all())
            .build();
        let children = JsArray::new(context)?;
        module.set(js_string!("children"), children, false, context)?;
        self.cjs.borrow_mut().insert((path.to_path_buf(), gen), module.clone());
        let run = (|| -> JsResult<()> {
            let require = make_require(path, jiti, gen, context)?;
            module.set(js_string!("require"), require.clone(), false, context)?;
            let wrapped = format!(
                "(function (exports, require, module, __filename, __dirname) {{{text}\n}})"
            );
            let f = context.eval(Source::from_bytes(wrapped.as_str()).with_path(path)).map_err(|e| {
                let flavor = Flavor { mode: if jiti { Mode::Jiti } else { Mode::Cjs }, jsx: false, profile: 0, jsx_auto: false, gen };
                syntax_failure(&text, path, flavor, e, context)
            })?;
            let f = f.as_object().expect("wrapper is a function");
            f.call(
                &exports.clone().into(),
                &[
                    exports.clone().into(),
                    require,
                    module.clone().into(),
                    JsString::from(file.as_str()).into(),
                    JsString::from(dir.as_str()).into(),
                ],
                context,
            )?;
            module.set(js_string!("loaded"), true, false, context)?;
            Ok(())
        })();
        if let Err(e) = run {
            self.cjs.borrow_mut().remove(&(path.to_path_buf(), gen));
            return Err(e);
        }
        module.get(js_string!("exports"), context)
    }

    /// `require(specifier)` from the file `from`.
    fn require(&self, spec: &str, from: &Path, jiti: bool, gen: u32, context: &mut Context) -> JsResult<JsValue> {
        let mode = if jiti { Mode::Jiti } else { Mode::Cjs };
        // jiti's `require` is its synchronous path: package exports match
        // the require conditions first.
        let sync = resolve::Profile { sync: jiti, ..Default::default() };
        let resolved = resolve::resolve_with(spec, from, mode, &sync).map_err(|e| {
            note_missing(&e.message, spec);
            coded_error("Error", e.code, &e.message, context)
        })?;
        match resolved {
            Resolved::Builtin(name) => {
                let m = self.builtin(&name, context)?;
                evaluate_now(&m, context)?;
                m.namespace(context).get(js_string!("default"), context)
            }
            Resolved::File(path) => {
                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                if ext == "json" {
                    let text = read_source(&path, context)?;
                    record_load(&path);
                    let json = context.global_object().get(js_string!("JSON"), context)?;
                    let parse = json.as_object().unwrap().get(js_string!("parse"), context)?;
                    return parse
                        .as_object()
                        .unwrap()
                        .call(&json, &[JsString::from(text.as_str()).into()], context)
                        .map_err(|_| json_module_error(&path, &text, context));
                }
                if self.cjs.borrow().contains_key(&(path.clone(), gen)) {
                    return self.require_cjs(&path, None, jiti, gen, context);
                }
                let text = read_source(&path, context)?;
                let text = if transform::is_typescript(&path) {
                    transform::strip(&text, &path, false, false)
                        .map_err(|m| coded_error("SyntaxError", "", &m, context))?
                } else {
                    text
                };
                if is_esm_source(&path, &text, context) {
                    // require(esm): the namespace, once evaluated.
                    let profile = self.profile_index(&sync);
                    let flavor = Flavor { mode: if jiti { Mode::Jiti } else { Mode::Esm }, jsx: false, profile, jsx_auto: false, gen };
                    let m = self.load_file(&path, flavor, false, true, context)?;
                    evaluate_now(&m, context)?;
                    let ns = m.namespace(context);
                    if jiti {
                        // jiti returns the default export when it is the only one.
                        return Ok(ns.into());
                    }
                    return Ok(ns.into());
                }
                self.require_cjs(&path, Some(text), jiti, gen, context)
            }
        }
    }
}

/// Link and evaluate a module synchronously (require of an ES module).
fn evaluate_now(m: &Module, context: &mut Context) -> JsResult<()> {
    let p = m.load_link_evaluate(context);
    if matches!(p.state(), PromiseState::Pending) {
        let _ = context.run_jobs();
    }
    match p.state() {
        PromiseState::Fulfilled(_) => Ok(()),
        PromiseState::Rejected(e) => Err(boa_engine::JsError::from_opaque(e)),
        PromiseState::Pending => Err(coded_error(
            "Error",
            "ERR_REQUIRE_ASYNC_MODULE",
            "require() cannot be used on an ESM graph with top-level await.",
            context,
        )),
    }
}

/// A `require` function for the file `from`.
fn make_require(from: &Path, jiti: bool, gen: u32, context: &mut Context) -> JsResult<JsValue> {
    let from_s = JsString::from(from.to_string_lossy().as_ref());
    let f = boa_engine::object::FunctionObjectBuilder::new(
        context.realm(),
        NativeFunction::from_copy_closure_with_captures(
            |_, args, (from, jiti, gen): &(JsString, bool, u32), ctx| {
                let spec = args.first().cloned().unwrap_or_default();
                let Some(spec) = spec.as_string() else {
                    return Err(coded_error(
                        "TypeError",
                        "ERR_INVALID_ARG_TYPE",
                        "The \"id\" argument must be of type string.",
                        ctx,
                    ));
                };
                let from = PathBuf::from(from.to_std_string_lossy());
                loader().require(&spec.to_std_string_lossy(), &from, *jiti, *gen, ctx)
            },
            (from_s.clone(), jiti, gen),
        ),
    )
    .name(js_string!("require"))
    .length(1)
    .build();
    let resolve_fn = boa_engine::object::FunctionObjectBuilder::new(
        context.realm(),
        NativeFunction::from_copy_closure_with_captures(
            |_, args, (from, jiti): &(JsString, bool), ctx| {
                let spec = args.first().cloned().unwrap_or_default().to_string(ctx)?.to_std_string_lossy();
                let from = PathBuf::from(from.to_std_string_lossy());
                let mode = if *jiti { Mode::Jiti } else { Mode::Cjs };
                match resolve::resolve(&spec, &from, mode) {
                    Ok(Resolved::File(p)) => Ok(JsString::from(p.to_string_lossy().as_ref()).into()),
                    Ok(Resolved::Builtin(n)) => Ok(JsString::from(spec.strip_prefix("node:").map(|_| spec.as_str()).unwrap_or(n.as_str())).into()),
                    Err(e) => Err(coded_error("Error", e.code, &e.message, ctx)),
                }
            },
            (from_s, jiti),
        ),
    )
    .name(js_string!("resolve"))
    .length(1)
    .build();
    f.set(js_string!("resolve"), resolve_fn, false, context)?;
    let cache = JsObject::with_object_proto(context.intrinsics());
    f.set(js_string!("cache"), cache, false, context)?;
    Ok(f.into())
}

/// The ES namespace Node gives a CommonJS module: `default` is
/// `module.exports`, plus each own enumerable key as a named export. jiti
/// (babel interop) takes `default` from `exports.default` when
/// `__esModule` is set.
fn cjs_namespace(exports: JsValue, jiti: bool, path: &Path, context: &mut Context) -> JsResult<Module> {
    let mut names: Vec<JsString> = vec![js_string!("default")];
    let mut default = exports.clone();
    if let Some(obj) = exports.as_object() {
        if !obj.is_callable() || true {
            let keys = context
                .eval(Source::from_bytes("Object.keys"))?
                .as_object()
                .unwrap()
                .call(&JsValue::undefined(), &[exports.clone()], context)?;
            let keys = JsArray::from_object(keys.as_object().unwrap())?;
            for i in 0..keys.length(context)? {
                let k = keys.get(i, context)?.to_string(context)?;
                if k != js_string!("default") {
                    names.push(k);
                }
            }
        }
        // Node's export-name scan finds the (usually non-enumerable)
        // `__esModule` marker too.
        let marker = js_string!("__esModule");
        if !names.contains(&marker) && obj.has_own_property(marker.clone(), context)? {
            names.push(marker);
        }
        if jiti && obj.get(js_string!("__esModule"), context)?.to_boolean() {
            default = obj.get(js_string!("default"), context)?;
        }
    }
    let names_arr = JsArray::new(context)?;
    for n in &names {
        names_arr.push(n.clone(), context)?;
    }
    Ok(Module::synthetic(
        &names,
        boa_engine::module::SyntheticModuleInitializer::from_copy_closure_with_captures(
            |m, (exports, default, names): &(JsValue, JsValue, JsArray), ctx| {
                m.set_export(&js_string!("default"), default.clone())?;
                let n = names.length(ctx)?;
                for i in 1..n {
                    let k = names.get(i, ctx)?.to_string(ctx)?;
                    let v = match exports.as_object() {
                        Some(o) => o.get(k.clone(), ctx)?,
                        None => JsValue::undefined(),
                    };
                    m.set_export(&k, v)?;
                }
                Ok(())
            },
            (exports, default, names_arr),
        ),
        Some(path.to_path_buf()),
        None,
        context,
    ))
}

/// What pruning a barrel needs to know about the modules it names.
struct Barrel<'a> {
    loader: &'a Loader,
    from: &'a Path,
    flavor: Flavor,
}

impl Barrel<'_> {
    fn resolve(&self, spec: &str) -> Option<PathBuf> {
        match resolve::resolve_with(spec, self.from, self.flavor.mode, &self.loader.profile(self.flavor.profile)) {
            Ok(Resolved::File(p)) => Some(p),
            _ => None,
        }
    }
}

impl prune::BarrelContext for Barrel<'_> {
    fn star_names(&self, spec: &str) -> Option<BTreeSet<String>> {
        let p = self.resolve(spec)?;
        let mut visiting = Vec::new();
        let mut names = self.loader.export_names(&p, self.flavor, &mut visiting)?;
        names.remove("default");
        Some(names)
    }

    fn has_side_effects(&self, spec: &str) -> bool {
        self.resolve(spec).map(|p| !resolve::package_is_pure(&p)).unwrap_or(true)
    }
}

impl Loader {
    /// Every name `path` exports, following `export *` (ambiguous star
    /// names left out, as the spec leaves them out). `None` when a module in
    /// the chain cannot be read or parsed, or is not an ES module.
    fn export_names(&self, path: &Path, flavor: Flavor, visiting: &mut Vec<PathBuf>) -> Option<BTreeSet<String>> {
        if let Some(n) = self.export_cache.borrow().get(path) {
            return n.clone();
        }
        if visiting.iter().any(|v| v == path) {
            return Some(BTreeSet::new());
        }
        visiting.push(path.to_path_buf());
        let result = (|| {
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            if !matches!(ext, "js" | "mjs") {
                return None;
            }
            if ext == "js" && !resolve::package_type_is_module(path) {
                return None;
            }
            let text = super::vfs::read_to_string(path).ok()?;
            let info = prune::export_info(&text)?;
            let mut names = info.names.clone();
            let mut from_stars: HashMap<String, usize> = HashMap::new();
            for spec in &info.stars {
                let p = match resolve::resolve_with(spec, path, flavor.mode, &self.profile(flavor.profile)) {
                    Ok(Resolved::File(p)) => p,
                    _ => return None,
                };
                let sub = self.export_names(&p, flavor, visiting)?;
                for n in sub {
                    if n != "default" {
                        *from_stars.entry(n).or_default() += 1;
                    }
                }
            }
            for (n, count) in from_stars {
                if count == 1 && !names.contains(&n) {
                    names.insert(n);
                }
            }
            Some(names)
        })();
        visiting.pop();
        self.export_cache.borrow_mut().insert(path.to_path_buf(), result.clone());
        result
    }
}

struct Trace<'a>(&'a Path, std::time::Instant);
impl Drop for Trace<'_> {
    fn drop(&mut self) {
        if TRACE {
            eprintln!("[js] {:>7.2}ms {}", self.1.elapsed().as_secs_f64() * 1000.0, self.0.display());
        }
    }
}

/// A module whose source does not parse: the error Node (or jiti) gives for
/// that source. Boa's own error stands when oxc finds nothing wrong.
fn syntax_failure(
    source: &str,
    path: &Path,
    flavor: Flavor,
    boa: boa_engine::JsError,
    context: &mut Context,
) -> boa_engine::JsError {
    use super::syntax::{syntax_error, Dialect};
    let is_syntax = matches!(boa.as_native().map(|n| n.kind().clone()), Some(boa_engine::JsNativeErrorKind::Syntax));
    if !is_syntax {
        return boa;
    }
    LAST_SYNTAX_FILE.with(|f| *f.borrow_mut() = Some(path.to_path_buf()));
    if TRACE {
        eprintln!("[js] syntax error in {}: {}", path.display(), boa);
    }
    let dialect = match flavor.mode {
        Mode::Jiti => Dialect::Jiti,
        Mode::Cjs => Dialect::V8Script,
        Mode::Esm => {
            if path.extension().and_then(|e| e.to_str()) == Some("cjs") {
                Dialect::V8Script
            } else {
                Dialect::V8Module
            }
        }
    };
    let ts = transform::is_typescript(path);
    let jsx = flavor.jsx || transform::is_jsx(path);
    match syntax_error(source, path, dialect, ts, jsx) {
        Some((name, message)) => coded_error(&name, "", &message, context),
        None => boa,
    }
}

/// A JSON module that does not parse: Node's SyntaxError, `path: message`
/// with V8's `JSON.parse` message.
fn json_module_error(path: &Path, text: &str, context: &mut Context) -> boa_engine::JsError {
    let message = super::jsonparse::parse(text).err().unwrap_or_else(|| "Unexpected end of JSON input".into());
    let native = JsNativeError::syntax().with_message(format!("{}: {message}", path.display()));
    boa_engine::JsError::from_opaque(native.into_opaque(context).into())
}

/// `JSON.parse` with V8's error messages.
fn install_json_parse(ctx: &mut Context) {
    let json = ctx.global_object().get(js_string!("JSON"), ctx).expect("JSON");
    let json = json.as_object().unwrap();
    let original = json.get(js_string!("parse"), ctx).expect("parse").as_object().unwrap();
    let func = boa_engine::object::FunctionObjectBuilder::new(
        ctx.realm(),
        NativeFunction::from_copy_closure_with_captures(
            |this, args, original: &JsObject, ctx| match original.call(this, args, ctx) {
                Ok(v) => Ok(v),
                Err(e) => {
                    let is_syntax = matches!(e.as_native().map(|n| n.kind().clone()), Some(boa_engine::JsNativeErrorKind::Syntax));
                    if !is_syntax {
                        return Err(e);
                    }
                    let text = args.first().cloned().unwrap_or_default().to_string(ctx)?.to_std_string_lossy();
                    match super::jsonparse::parse(&text) {
                        Err(m) => Err(JsNativeError::syntax().with_message(m).into()),
                        Ok(_) => Err(e),
                    }
                }
            },
            original,
        ),
    )
    .name(js_string!("parse"))
    .length(2)
    .build();
    json.define_property_or_throw(
        js_string!("parse"),
        boa_engine::property::PropertyDescriptor::builder().value(func).writable(true).enumerable(false).configurable(true),
        ctx,
    )
    .expect("define JSON.parse");
}

fn unknown_extension(ext: &str, path: &Path, context: &mut Context) -> boa_engine::JsError {
    coded_error(
        "TypeError",
        "ERR_UNKNOWN_FILE_EXTENSION",
        &format!("Unknown file extension \".{ext}\" for {}", path.display()),
        context,
    )
}

fn read_source(path: &Path, context: &mut Context) -> JsResult<String> {
    if let Some(text) = OVERRIDES.with(|o| o.borrow().iter().find(|(p, _)| p == path).map(|(_, t)| t.clone())) {
        if TRACE { eprintln!("[js] override {}", path.display()); }
        return Ok(text);
    }
    super::vfs::read_to_string(path).map_err(|e| {
        coded_error("Error", "ENOENT", &format!("{e}: {}", path.display()), context)
    })
}

impl ModuleLoader for Loader {
    fn load_imported_module(
        self: Rc<Self>,
        referrer: Referrer,
        request: ModuleRequest,
        context: &RefCell<&mut Context>,
    ) -> impl std::future::Future<Output = JsResult<Module>> {
        let result = (|| {
            let ctx = &mut *context.borrow_mut();
            let info = self.info_of(&referrer);
            let flavor = info.flavor;
            let spec = request.specifier().to_std_string_lossy();
            let from = referrer.path().map(Path::to_path_buf).unwrap_or_default();
            let wanted = match info.usage.get(&spec) {
                Some(Wanted::Names(n)) => Some(n.clone()),
                _ => None,
            };
            let profile = self.profile(flavor.profile);
            if let Some((_, id)) = profile.virtuals.iter().find(|(s, _)| *s == spec) {
                if let Some(m) = self.virtuals.borrow().get(id) {
                    return Ok(m.clone());
                }
            }
            let pure_entry = wanted.as_ref().and_then(|_| resolve::pure_module_entry(&spec, &from));
            let resolved = match pure_entry {
                Some(p) => Resolved::File(p),
                None => resolve::resolve_with(&spec, &from, flavor.mode, &self.profile(flavor.profile))
                    .map_err(|e| {
                        note_missing(&e.message, &spec);
                        coded_error("Error", e.code, &e.message, ctx)
                    })?,
            };
            match resolved {
                Resolved::Builtin(name) => self.builtin(&name, ctx),
                Resolved::File(path) => {
                    let json_attr = request
                        .get_attribute("type")
                        .map(|t| t == &js_string!("json"))
                        .unwrap_or(false);
                    self.load_file_wanting(&path, flavor, json_attr, true, wanted.as_ref(), ctx)
                }
            }
        })();
        async { result }
    }

    fn init_import_meta(self: Rc<Self>, import_meta: &JsObject, module: &Module, context: &mut Context) {
        let Some(path) = module.path() else { return };
        let url = resolve::path_to_file_url(path);
        let dir = path.parent().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
        let _ = import_meta.set(js_string!("url"), JsString::from(url.as_str()), false, context);
        let _ = import_meta.set(
            js_string!("filename"),
            JsString::from(path.to_string_lossy().as_ref()),
            false,
            context,
        );
        let _ = import_meta.set(js_string!("dirname"), JsString::from(dir.as_str()), false, context);
    }
}

const BOOTSTRAP: &str = r#"(() => {
// Globals that cost real work install on first use: the URL classes load
// the `node:url` shim, console and util.inspect load inspect.js.
const lazy = (name, load) => Object.defineProperty(globalThis, name, {
  configurable: true,
  enumerable: false,
  get() { load(); return globalThis[name]; },
  set(v) { Object.defineProperty(globalThis, name, {value: v, writable: true, configurable: true, enumerable: false}); },
});
const settle = (name, value) => Object.defineProperty(globalThis, name, {value, writable: true, configurable: true, enumerable: false});
const loadUrl = () => { const ns = __astryx_host.builtinNamespace('url'); settle('URL', ns.URL); settle('URLSearchParams', ns.URLSearchParams); };
lazy('URL', loadUrl);
lazy('URLSearchParams', loadUrl);
const loadInspect = () => {
  for (const n of ['console', '__astryx_inspect', '__astryx_format']) settle(n, undefined);
  __astryx_host.loadInspect();
};
lazy('console', loadInspect);
lazy('__astryx_inspect', loadInspect);
lazy('__astryx_format', loadInspect);
globalThis.global = globalThis;
process.nextTick = (fn, ...args) => { Promise.resolve().then(() => fn(...args)); };
process.memoryUsage = () => ({rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0});
process.memoryUsage.rss = () => 0;
process.hrtime = (prev) => { const t = __astryx_host.now(); const s = Math.floor(t / 1000), ns = Math.floor((t % 1000) * 1e6); if (!prev) return [s, ns]; let ds = s - prev[0], dn = ns - prev[1]; if (dn < 0) { ds--; dn += 1e9; } return [ds, dn]; };
process.hrtime.bigint = () => BigInt(Math.floor(__astryx_host.now() * 1e6));
process.version = 'v22.23.2';
process.versions = {node: '22.23.2'};
process.execArgv = [];
process.exitCode = undefined;
process.on = () => process; process.once = () => process; process.off = () => process; process.emit = () => false;
process.removeListener = () => process; process.listeners = () => [];
const nodePow = Math.pow;
Object.defineProperty(globalThis, '__astryx_pow', {
  value: (a, b) => (typeof a === 'bigint' || typeof b === 'bigint') ? a ** b : nodePow(+a, +b),
  writable: false, enumerable: false, configurable: false,
});
const group = name => () => __astryx_host.loadGlobals(name);
for (const n of ['setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'clearImmediate', 'queueMicrotask', '__astryx_timers']) lazy(n, group('timers'));
for (const n of ['AbortSignal', 'AbortController']) lazy(n, group('abort'));
for (const n of ['TextEncoder', 'TextDecoder']) lazy(n, group('text'));
for (const n of ['MessagePort', 'MessageChannel']) lazy(n, group('message'));
for (const n of ['structuredClone', '__astryx_revive']) lazy(n, group('clone'));
})();
"#;

/// Globals installed on first use (see BOOTSTRAP).
const GLOBALS_TIMERS: &str = r#"(() => {
const timers = new Map();
let nextId = 1;
class Timeout {
  constructor(id) { this._id = id; }
  ref() { return this; }
  unref() { return this; }
  hasRef() { return true; }
  refresh() { return this; }
  [Symbol.toPrimitive]() { return this._id; }
}
function addTimer(fn, ms, args, repeat, immediate) {
  if (typeof fn !== 'function') { const e = new TypeError('The "callback" argument must be of type function. Received ' + typeof fn); e.code = 'ERR_INVALID_ARG_TYPE'; throw e; }
  let delay = Number(ms);
  if (immediate) delay = 0;
  else if (!(delay >= 1 && delay <= 2147483647)) delay = 1;
  const id = nextId++;
  timers.set(id, {fn, args, due: __astryx_host.now() + delay, every: repeat ? delay : 0});
  return new Timeout(id);
}
function clearTimer(t) { if (t == null) return; timers.delete(typeof t === 'object' ? t._id : Number(t)); }
globalThis.setTimeout = (fn, ms, ...args) => addTimer(fn, ms, args, false);
globalThis.setInterval = (fn, ms, ...args) => addTimer(fn, ms, args, true);
globalThis.setImmediate = (fn, ...args) => addTimer(fn, 0, args, false, true);
globalThis.clearTimeout = clearTimer;
globalThis.clearInterval = clearTimer;
globalThis.clearImmediate = clearTimer;
globalThis.queueMicrotask = fn => { Promise.resolve().then(fn); };
__astryx_host.timersLoaded();
globalThis.__astryx_timers = {
  next() { let min = -1; for (const t of timers.values()) if (min < 0 || t.due < min) min = t.due; return min; },
  fire() {
    const now = __astryx_host.now();
    const due = [...timers.entries()].filter(([, t]) => t.due <= now).sort((a, b) => a[1].due - b[1].due || a[0] - b[0]);
    for (const [id, t] of due) {
      if (!timers.has(id)) continue;
      if (t.every) t.due = now + t.every; else timers.delete(id);
      t.fn(...t.args);
    }
  },
};
})();
"#;
const GLOBALS_ABORT: &str = r#"(() => {
class AbortSignal {
  constructor() { this.aborted = false; this.reason = undefined; this.onabort = null; this._listeners = []; }
  addEventListener(type, fn) { if (type === 'abort') this._listeners.push(fn); }
  removeEventListener(type, fn) { this._listeners = this._listeners.filter(f => f !== fn); }
  throwIfAborted() { if (this.aborted) throw this.reason; }
  _abort(reason) {
    if (this.aborted) return;
    this.aborted = true;
    this.reason = reason === undefined ? Object.assign(new Error('This operation was aborted'), {name: 'AbortError', code: 20}) : reason;
    const ev = {type: 'abort', target: this};
    if (typeof this.onabort === 'function') this.onabort(ev);
    for (const fn of this._listeners) fn(ev);
  }
  static abort(reason) { const s = new AbortSignal(); s._abort(reason); return s; }
  static timeout(ms) { const s = new AbortSignal(); setTimeout(() => s._abort(Object.assign(new Error('The operation was aborted due to timeout'), {name: 'TimeoutError', code: 23})), ms); return s; }
  static any(signals) { const s = new AbortSignal(); for (const x of signals) { if (x.aborted) { s._abort(x.reason); break; } x.addEventListener('abort', () => s._abort(x.reason)); } return s; }
}
class AbortController {
  constructor() { this.signal = new AbortSignal(); }
  abort(reason) { this.signal._abort(reason); }
}
globalThis.AbortSignal = AbortSignal;
globalThis.AbortController = AbortController;
})();
"#;
const GLOBALS_TEXT: &str = r#"(() => {
class TextEncoder {
  get encoding() { return 'utf-8'; }
  encode(input = '') {
    const s = String(input);
    const out = [];
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
        const d = s.charCodeAt(i + 1);
        if (d >= 0xDC00 && d <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; }
        else c = 0xFFFD;
      } else if (c >= 0xD800 && c <= 0xDFFF) c = 0xFFFD;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }
  encodeInto(src, dest) {
    const bytes = this.encode(src);
    let n = Math.min(bytes.length, dest.length);
    while (n > 0 && n < bytes.length && (bytes[n] & 0xC0) === 0x80) n--;
    dest.set(bytes.subarray(0, n));
    const read = new TextDecoder().decode(bytes.subarray(0, n)).length;
    return {read, written: n};
  }
}
class TextDecoder {
  constructor(label = 'utf-8', options = {}) {
    const l = String(label).toLowerCase();
    if (l !== 'utf-8' && l !== 'utf8' && l !== 'unicode-1-1-utf-8') { const e = new RangeError('The "' + label + '" encoding is not supported'); e.code = 'ERR_ENCODING_NOT_SUPPORTED'; throw e; }
    this.fatal = !!options.fatal; this.ignoreBOM = !!options.ignoreBOM; this._pending = [];
  }
  get encoding() { return 'utf-8'; }
  decode(input, options = {}) {
    let bytes = input === undefined ? new Uint8Array(0) : input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    if (this._pending.length) { const b = new Uint8Array(this._pending.length + bytes.length); b.set(this._pending); b.set(bytes, this._pending.length); bytes = b; this._pending = []; }
    let out = '';
    let i = 0;
    if (!this.ignoreBOM && !this._started && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) i = 3;
    this._started = !!options.stream;
    const bad = () => { if (this.fatal) { const e = new TypeError('The encoded data was not valid for encoding utf-8'); e.code = 'ERR_ENCODING_INVALID_ENCODED_DATA'; throw e; } out += '\uFFFD'; };
    while (i < bytes.length) {
      const b = bytes[i];
      let need = 0, c = 0, min = 0;
      if (b < 0x80) { out += String.fromCharCode(b); i++; continue; }
      else if (b >= 0xC2 && b <= 0xDF) { need = 1; c = b & 31; min = 0x80; }
      else if (b >= 0xE0 && b <= 0xEF) { need = 2; c = b & 15; min = 0x800; }
      else if (b >= 0xF0 && b <= 0xF4) { need = 3; c = b & 7; min = 0x10000; }
      else { bad(); i++; continue; }
      if (options.stream && i + need >= bytes.length) { this._pending = Array.from(bytes.subarray(i)); break; }
      let j = 1;
      for (; j <= need; j++) { const x = bytes[i + j]; if (x === undefined || (x & 0xC0) !== 0x80) break; c = (c << 6) | (x & 63); }
      if (j <= need || c < min || c > 0x10FFFF || (c >= 0xD800 && c <= 0xDFFF)) { bad(); i += Math.max(1, j); continue; }
      out += String.fromCodePoint(c);
      i += need + 1;
    }
    return out;
  }
}
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;
})();
"#;
const GLOBALS_MESSAGE: &str = r#"(() => {
class MessagePort {
  constructor() { this.onmessage = null; this._other = null; this._listeners = []; this._closed = false; }
  postMessage(data) {
    const target = this._other;
    if (!target || this._closed) return;
    setImmediate(() => {
      if (target._closed) return;
      const ev = {data, target, type: 'message'};
      if (typeof target.onmessage === 'function') target.onmessage(ev);
      for (const fn of target._listeners) fn(ev);
    });
  }
  addEventListener(type, fn) { if (type === 'message') this._listeners.push(fn); }
  removeEventListener(type, fn) { this._listeners = this._listeners.filter(f => f !== fn); }
  start() {}
  close() { this._closed = true; }
  ref() { return this; }
  unref() { return this; }
}
class MessageChannel {
  constructor() { this.port1 = new MessagePort(); this.port2 = new MessagePort(); this.port1._other = this.port2; this.port2._other = this.port1; }
}
globalThis.MessagePort = MessagePort;
globalThis.MessageChannel = MessageChannel;
})();
"#;
const GLOBALS_CLONE: &str = r#"(() => {
globalThis.structuredClone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
globalThis.__astryx_revive = text => JSON.parse(text, (k, v) => {
  if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.__js === 'string') {
    if (v.__js === 'abort_signal') return new AbortController().signal;
    if (v.__js === 'undefined') return undefined;
  }
  return v;
});
})();
"#;


pub(super) enum Settled {
    Fulfilled(JsValue),
    Rejected(JsValue),
    Timeout,
    Unsettled,
}

pub struct Engine {
    pub ctx: Context,
    loader: Rc<Loader>,
    conv: Converter,
    namespaces: HashMap<(Flavor, PathBuf), Namespace>,
}

impl Engine {
    fn new() -> Self {
        let t0 = std::time::Instant::now();
        let mark = |what: &str| {
            if TRACE {
                eprintln!("[js] engine {what}: {:.2}ms", t0.elapsed().as_secs_f64() * 1000.0);
            }
        };
        let loader = Rc::new(Loader::default());
        LOADER.with(|l| *l.borrow_mut() = Some(loader.clone()));
        let mut ctx = Context::builder().module_loader(loader.clone()).build().expect("context");
        // Node's limits are much higher than Boa's defaults: large doc
        // literals need a deep value stack.
        ctx.runtime_limits_mut().set_stack_size_limit(1 << 24);
        ctx.runtime_limits_mut().set_recursion_limit(10_000);
        // Boa's AST optimizer (constant folding) changes no result and
        // costs parse time on large files.
        ctx.set_optimizer_options(boa_engine::optimizer::OptimizerOptions::empty());
        mark("context");
        install_host(&mut ctx);
        mark("host");
        install_locale_compare(&mut ctx);
        install_json_parse(&mut ctx);
        install_math_fn(&mut ctx, "pow", |a| super::jsmath::pow(arg(a, 0), arg(a, 1)));
        install_math_fn(&mut ctx, "atan2", |a| super::jsmath::atan2(arg(a, 0), arg(a, 1)));
        install_math_fn(&mut ctx, "cbrt", |a| super::jsmath::cbrt(arg(a, 0)));
        install_math_fn(&mut ctx, "atan", |a| super::jsmath::atan(arg(a, 0)));
        install_math_fn(&mut ctx, "sin", |a| super::jsmath::sin(arg(a, 0)));
        install_math_fn(&mut ctx, "cos", |a| super::jsmath::cos(arg(a, 0)));
        install_math_fn(&mut ctx, "hypot", super::jsmath::hypot);
        install_math_fn(&mut ctx, "exp", |a| super::jsmath::exp(arg(a, 0)));
        install_math_fn(&mut ctx, "expm1", |a| super::jsmath::expm1(arg(a, 0)));
        install_math_fn(&mut ctx, "log", |a| super::jsmath::log(arg(a, 0)));
        install_math_fn(&mut ctx, "log1p", |a| super::jsmath::log1p(arg(a, 0)));
        install_math_fn(&mut ctx, "log2", |a| super::jsmath::log2(arg(a, 0)));
        install_math_fn(&mut ctx, "log10", |a| super::jsmath::log10(arg(a, 0)));
        MATH.with(|m| {
            for (name, f) in m.borrow().iter() {
                install_math_fn(&mut ctx, name, *f);
            }
        });
        mark("math");
        let conv = Converter::new(&mut ctx).expect("converter");
        mark("converter");
        let mut engine = Self { ctx, loader, conv, namespaces: HashMap::new() };
        engine.bootstrap();
        mark("bootstrap");
        engine
    }

    /// Node globals that builtin shims provide (`URL`, `URLSearchParams`).
    fn bootstrap(&mut self) {
        self.ctx.eval(Source::from_bytes(BOOTSTRAP)).expect("bootstrap runs");
    }

    /// Load and evaluate a module (cached unless `fresh`).
    pub(super) fn load(&mut self, path: &Path, opts: &ImportOptions) -> Result<(Module, Flavor, PathBuf), JsError> {
        self.load_with(path, opts, &JitiOptions::default())
    }

    fn flavor_for(&self, abs: &Path, opts: &ImportOptions, jiti: &JitiOptions) -> Flavor {
        let mode = if transform::is_typescript(abs) || jiti.force { Mode::Jiti } else { Mode::Esm };
        let profile = self.loader.profile_index(&resolve::Profile {
            aliases: jiti.aliases.clone(),
            extensions: jiti.extensions.clone(),
            virtuals: jiti.virtual_modules.clone(),
            sync: mode == Mode::Jiti && (jiti.sync || !jiti.virtual_modules.is_empty()),
            overrides: jiti.source_overrides.iter().map(|(p, t)| (resolve::real(p), t.clone())).collect(),
        });
        let jsx = (opts.jsx || jiti.jsx_automatic) && mode == Mode::Jiti;
        Flavor { mode, jsx, profile, jsx_auto: jsx && jiti.jsx_automatic, gen: 0 }
    }

    /// [`Self::load`] with jiti's options.
    pub(super) fn load_with(
        &mut self,
        path: &Path,
        opts: &ImportOptions,
        jiti: &JitiOptions,
    ) -> Result<(Module, Flavor, PathBuf), JsError> {
        let abs = if path.is_absolute() {
            path.to_path_buf()
        } else {
            std::env::current_dir().unwrap_or_default().join(path)
        };
        let abs = resolve::normalize(&abs);
        let mut flavor = self.flavor_for(&abs, opts, jiti);
        let overrides: Vec<(PathBuf, String)> =
            jiti.source_overrides.iter().map(|(p, t)| (resolve::real(p), t.clone())).collect();
        let previous = OVERRIDES.with(|o| std::mem::replace(&mut *o.borrow_mut(), overrides));
        let result = self.load_flavored(&abs, opts, &mut flavor);
        OVERRIDES.with(|o| *o.borrow_mut() = previous);
        result
    }

    fn load_flavored(
        &mut self,
        abs: &Path,
        opts: &ImportOptions,
        flavor: &mut Flavor,
    ) -> Result<(Module, Flavor, PathBuf), JsError> {
        let abs = abs.to_path_buf();
        let mode = flavor.mode;
        if opts.fresh && mode == Mode::Jiti {
            flavor.gen = GENERATIONS.with(|g| {
                g.set(g.get() + 1);
                g.get()
            });
            self.loader.export_cache.borrow_mut().clear();
        }
        let fail = |name: &str, code: Option<&str>, message: String| JsError {
            name: name.into(),
            message,
            code: code.map(String::from),
            file: abs.clone(),
        };
        if !super::vfs::is_file(&abs) {
            let code = match mode {
                Mode::Esm => "ERR_MODULE_NOT_FOUND",
                Mode::Jiti | Mode::Cjs => "MODULE_NOT_FOUND",
            };
            return Err(fail("Error", Some(code), format!("Cannot find module '{}'", abs.display())));
        }
        let real = resolve::real(&abs);
        let module = self
            .loader
            .load_file(&real, *flavor, false, !opts.fresh || flavor.gen != 0, &mut self.ctx)
            .map_err(|e| self.to_js_error(e, &abs))?;
        let promise = module.load_link_evaluate(&mut self.ctx);
        match self.settle(&promise, None) {
            Settled::Fulfilled(_) => Ok((module, *flavor, real)),
            Settled::Rejected(err) => Err(self.to_js_error(boa_engine::JsError::from_opaque(err), &abs)),
            Settled::Timeout | Settled::Unsettled => Err(fail(
                "Error",
                Some("ERR_UNSETTLED_TOP_LEVEL_AWAIT"),
                "Top-level await never settled".into(),
            )),
        }
    }

    /// Run jobs and timers until `promise` settles, or the deadline passes,
    /// or nothing is left that could settle it.
    pub(super) fn settle(&mut self, promise: &JsPromise, deadline: Option<std::time::Instant>) -> Settled {
        loop {
            let _ = self.ctx.run_jobs();
            match promise.state() {
                PromiseState::Fulfilled(v) => return Settled::Fulfilled(v),
                PromiseState::Rejected(e) => return Settled::Rejected(e),
                PromiseState::Pending => {}
            }
            let next = self.timers_call("next").and_then(|v| v.as_number()).unwrap_or(-1.0);
            if next < 0.0 {
                return Settled::Unsettled;
            }
            let wait = (next - now_ms()).max(0.0);
            let mut wait = std::time::Duration::from_secs_f64(wait / 1000.0);
            if let Some(d) = deadline {
                let left = d.saturating_duration_since(std::time::Instant::now());
                if left.is_zero() {
                    return Settled::Timeout;
                }
                if left < wait {
                    std::thread::sleep(left);
                    return Settled::Timeout;
                }
            }
            if wait > std::time::Duration::ZERO {
                wait = wait.min(std::time::Duration::from_secs(3600));
                std::thread::sleep(wait);
            }
            let _ = self.timers_call("fire");
        }
    }

    /// Make a virtual module whose exports are `obj`'s own enumerable keys
    /// (values read when the module links), plus `default` = `obj` unless
    /// `obj` has its own `default`. Pass the id in
    /// `JitiOptions::virtual_modules`.
    #[allow(dead_code)]
    pub(super) fn register_virtual(&mut self, obj: JsObject) -> JsResult<u64> {
        let keys = self.ctx.eval(Source::from_bytes("Object.keys"))?;
        let keys = keys.as_object().unwrap().call(&JsValue::undefined(), &[obj.clone().into()], &mut self.ctx)?;
        let keys = JsArray::from_object(keys.as_object().unwrap())?;
        let mut names: Vec<JsString> = Vec::new();
        for i in 0..keys.length(&mut self.ctx)? {
            names.push(keys.get(i, &mut self.ctx)?.to_string(&mut self.ctx)?);
        }
        if !names.contains(&js_string!("default")) {
            names.push(js_string!("default"));
        }
        let names_arr = JsArray::new(&mut self.ctx)?;
        for n in &names {
            names_arr.push(n.clone(), &mut self.ctx)?;
        }
        let module = Module::synthetic(
            &names,
            boa_engine::module::SyntheticModuleInitializer::from_copy_closure_with_captures(
                |m, (obj, names): &(JsObject, JsArray), ctx| {
                    for i in 0..names.length(ctx)? {
                        let k = names.get(i, ctx)?.to_string(ctx)?;
                        let v = if k == js_string!("default") && !obj.has_own_property(k.clone(), ctx)? {
                            obj.clone().into()
                        } else {
                            obj.get(k.clone(), ctx)?
                        };
                        m.set_export(&k, v)?;
                    }
                    Ok(())
                },
                (obj, names_arr),
            ),
            None,
            None,
            &mut self.ctx,
        );
        let id = VIRTUAL_IDS.with(|c| {
            let v = c.get() + 1;
            c.set(v);
            v
        });
        self.loader.info.borrow_mut().insert(module.clone(), ModInfo::new(Flavor { mode: Mode::Esm, jsx: false, profile: 0, jsx_auto: false, gen: 0 }));
        self.loader.virtuals.borrow_mut().insert(id, module);
        Ok(id)
    }

    /// Await `value` when it is a promise (running jobs and timers);
    /// `Err` carries the rejection reason, or `undefined` for a timeout or a
    /// promise nothing can settle.
    #[allow(dead_code)]
    pub(super) fn settle_value(
        &mut self,
        value: JsValue,
        deadline: Option<std::time::Instant>,
    ) -> Result<JsValue, JsValue> {
        let Some(p) = value.as_object().and_then(|o| JsPromise::from_object(o).ok()) else {
            let _ = self.ctx.run_jobs();
            return Ok(value);
        };
        match self.settle(&p, deadline) {
            Settled::Fulfilled(v) => Ok(v),
            Settled::Rejected(e) => Err(e),
            Settled::Timeout | Settled::Unsettled => Err(JsValue::undefined()),
        }
    }

    /// Convert a value as `import_module` converts a namespace.
    #[allow(dead_code)]
    pub(super) fn to_json(&mut self, value: &JsValue) -> JsResult<crate::json::Value> {
        self.conv.convert(value, &mut self.ctx)
    }

    fn timers_call(&mut self, name: &str) -> Option<JsValue> {
        if !TIMERS_LOADED.with(|t| t.get()) {
            return None;
        }
        let timers = self.ctx.global_object().get(js_string!("__astryx_timers"), &mut self.ctx).ok()?;
        let timers = timers.as_object()?;
        let f = timers.get(JsString::from(name), &mut self.ctx).ok()?;
        f.as_object()?.call(&timers.clone().into(), &[], &mut self.ctx).ok()
    }

    pub fn import(&mut self, path: &Path, opts: &ImportOptions) -> Result<Namespace, JsError> {
        self.import_with(path, opts, &JitiOptions::default())
    }

    pub fn import_with(&mut self, path: &Path, opts: &ImportOptions, jiti: &JitiOptions) -> Result<Namespace, JsError> {
        let abs = if path.is_absolute() {
            path.to_path_buf()
        } else {
            std::env::current_dir().unwrap_or_default().join(path)
        };
        let flavor = self.flavor_for(&resolve::normalize(&abs), opts, jiti);
        let key = (flavor, resolve::real(&resolve::normalize(&abs)));
        if !opts.fresh {
            if let Some(ns) = self.namespaces.get(&key) {
                return Ok(ns.clone());
            }
        }
        let (module, _, _) = self.load_with(path, opts, jiti)?;
        let ns = module.namespace(&mut self.ctx);
        let value = self
            .conv
            .convert(&ns.into(), &mut self.ctx)
            .map_err(|e| self.to_js_error(e, &abs))?;
        let crate::json::Value::Object(map) = value else { unreachable!("namespace is an object") };
        if !opts.fresh {
            self.namespaces.insert(key, map.clone());
        }
        Ok(map)
    }

    pub fn call_export(
        &mut self,
        path: &Path,
        export: &[&str],
        args: &[crate::json::Value],
        opts: &CallOptions,
    ) -> Result<CallResult, CallError> {
        // The call's options stay in force until it settles: dynamic
        // imports made later (from promise jobs too) see the same overrides
        // and module instances as the static graph.
        let overrides: Vec<(PathBuf, String)> =
            opts.jiti.source_overrides.iter().map(|(p, t)| (resolve::real(p), t.clone())).collect();
        let prev_overrides = OVERRIDES.with(|o| std::mem::replace(&mut *o.borrow_mut(), overrides));
        let prev_scope = CALL_FLAVOR.with(|c| c.get());
        let result = self.call_export_scoped(path, export, args, opts);
        OVERRIDES.with(|o| *o.borrow_mut() = prev_overrides);
        CALL_FLAVOR.with(|c| c.set(prev_scope));
        result
    }

    fn call_export_scoped(
        &mut self,
        path: &Path,
        export: &[&str],
        args: &[crate::json::Value],
        opts: &CallOptions,
    ) -> Result<CallResult, CallError> {
        let (module, flavor, real) = self.load_with(path, &opts.import, &opts.jiti).map_err(CallError::Load)?;
        CALL_FLAVOR.with(|c| c.set(Some(flavor)));
        let ns: JsValue = module.namespace(&mut self.ctx).into();
        let not_fn = || CallError::NotAFunction(export.join("."));
        let mut this = JsValue::undefined();
        let mut cur = ns.clone();
        for (i, key) in export.iter().enumerate() {
            let obj = cur.as_object().ok_or_else(not_fn)?;
            let mut next = obj.get(JsString::from(*key), &mut self.ctx).map_err(|_| not_fn())?;
            // jiti's default interop: a missing export reads the default
            // export's property; a missing default is the module itself.
            if i == 0 && flavor.mode == Mode::Jiti && next.is_undefined() {
                if *key == "default" {
                    next = ns.clone();
                } else if let Some(d) = obj.get(js_string!("default"), &mut self.ctx).ok().and_then(|d| d.as_object()) {
                    next = d.get(JsString::from(*key), &mut self.ctx).unwrap_or_default();
                }
            }
            this = cur;
            cur = next;
        }
        let func = cur.as_object().filter(|o| o.is_callable()).ok_or_else(not_fn)?;
        let text = crate::json::stringify(&crate::json::Value::Array(args.to_vec()), 0);
        let revive = self.ctx.global_object().get(js_string!("__astryx_revive"), &mut self.ctx).expect("revive");
        let js_args = revive
            .as_object()
            .expect("revive fn")
            .call(&JsValue::undefined(), &[JsString::from(text.as_str()).into()], &mut self.ctx)
            .expect("revive args");
        let js_args = JsArray::from_object(js_args.as_object().unwrap()).unwrap();
        let n = js_args.length(&mut self.ctx).unwrap_or(0);
        let mut argv = Vec::new();
        for i in 0..n {
            argv.push(js_args.get(i, &mut self.ctx).unwrap_or_default());
        }
        EXIT.with(|e| e.set(None));
        let deadline = opts.timeout_ms.map(|ms| std::time::Instant::now() + std::time::Duration::from_millis(ms));
        let outcome = func.call(&this, &argv, &mut self.ctx);
        let settled = match outcome {
            Err(e) => match e.into_opaque(&mut self.ctx) {
                Ok(v) => Settled::Rejected(v),
                Err(e) => Settled::Rejected(JsString::from(e.to_string().as_str()).into()),
            },
            Ok(v) => match v.as_object().and_then(|o| JsPromise::from_object(o).ok()) {
                Some(p) => self.settle(&p, deadline),
                None => {
                    let _ = self.ctx.run_jobs();
                    Settled::Fulfilled(v)
                }
            },
        };
        if let Some(code) = EXIT.with(|e| e.take()) {
            return Err(CallError::Exit { code, output: Vec::new() });
        }
        let exit_code = self.take_exit_code();
        match settled {
            Settled::Fulfilled(v) => {
                let value = match self.conv.convert(&v, &mut self.ctx) {
                    Ok(v) => v,
                    Err(e) => {
                        let error = self.to_js_error(e, &real);
                        return Err(CallError::Thrown { error, output: Vec::new(), exit_code });
                    }
                };
                Ok(CallResult { value, output: Vec::new(), exit_code })
            }
            Settled::Rejected(err) => {
                let error = error_fields(&err, &real, &mut self.ctx);
                Err(CallError::Thrown { error, output: Vec::new(), exit_code })
            }
            Settled::Timeout => Err(CallError::Timeout { output: Vec::new() }),
            Settled::Unsettled => Err(CallError::Unsettled { output: Vec::new() }),
        }
    }

    /// Read and clear `process.exitCode`.
    fn take_exit_code(&mut self) -> Option<i32> {
        let process = self.ctx.global_object().get(js_string!("process"), &mut self.ctx).ok()?;
        let process = process.as_object()?;
        let code = process.get(js_string!("exitCode"), &mut self.ctx).ok()?;
        if code.is_undefined() || code.is_null() {
            return None;
        }
        let n = code.to_i32(&mut self.ctx).ok();
        let _ = process.set(js_string!("exitCode"), JsValue::undefined(), false, &mut self.ctx);
        n
    }

    pub(super) fn to_js_error(&mut self, err: boa_engine::JsError, file: &Path) -> JsError {
        let ctx = &mut self.ctx;
        let value = match err.into_opaque(ctx) {
            Ok(v) => v,
            Err(e) => {
                return JsError {
                    name: "Error".into(),
                    message: e.to_string(),
                    code: None,
                    file: file.to_path_buf(),
                }
            }
        };
        error_fields(&value, file, ctx)
    }
}

thread_local! {
    /// The file of the last syntax error a load hit.
    pub static LAST_SYNTAX_FILE: RefCell<Option<PathBuf>> = const { RefCell::new(None) };
    /// The `stack` of the last error converted (diagnostics).
    pub static LAST_STACK: RefCell<String> = RefCell::new(String::new());
}

pub fn error_fields(value: &JsValue, file: &Path, ctx: &mut Context) -> JsError {
    if let Some(obj) = value.as_object() {
        if let Ok(st) = obj.get(js_string!("stack"), ctx) {
            if let Ok(st) = st.to_string(ctx) {
                LAST_STACK.with(|s| *s.borrow_mut() = st.to_std_string_lossy());
            }
        }
        let get = |k: &str, ctx: &mut Context| -> Option<String> {
            let v = obj.get(JsString::from(k), ctx).ok()?;
            if v.is_undefined() {
                return None;
            }
            v.to_string(ctx).ok().map(|s| s.to_std_string_lossy())
        };
        JsError {
            name: get("name", ctx).unwrap_or_default(),
            message: get("message", ctx).unwrap_or_default(),
            code: get("code", ctx).filter(|c| !c.is_empty()),
            file: file.to_path_buf(),
        }
    } else {
        JsError {
            name: String::new(),
            message: value
                .to_string(ctx)
                .map(|s| s.to_std_string_lossy())
                .unwrap_or_default(),
            code: None,
            file: file.to_path_buf(),
        }
    }
}

fn arg_string(args: &[JsValue], i: usize, ctx: &mut Context) -> JsResult<String> {
    Ok(args.get(i).cloned().unwrap_or_default().to_string(ctx)?.to_std_string_lossy())
}

fn io_error_obj(e: &std::io::Error, ctx: &mut Context) -> JsValue {
    let code = match e.kind() {
        std::io::ErrorKind::NotFound => "ENOENT",
        std::io::ErrorKind::PermissionDenied => "EACCES",
        _ if e.raw_os_error() == Some(21) => "EISDIR",
        _ if e.raw_os_error() == Some(20) => "ENOTDIR",
        _ => "EIO",
    };
    let message = match code {
        "ENOENT" => "no such file or directory",
        "EACCES" => "permission denied",
        "EISDIR" => "illegal operation on a directory",
        "ENOTDIR" => "not a directory",
        _ => "i/o error",
    };
    ObjectInitializer::new(ctx)
        .property(js_string!("code"), JsString::from(code), Attribute::all())
        .property(js_string!("message"), JsString::from(message), Attribute::all())
        .build()
        .into()
}

fn stat_obj(meta: &std::fs::Metadata, link: bool, ctx: &mut Context) -> JsValue {
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0);
    ObjectInitializer::new(ctx)
        .property(js_string!("file"), meta.is_file(), Attribute::all())
        .property(js_string!("dir"), meta.is_dir(), Attribute::all())
        .property(js_string!("link"), link, Attribute::all())
        .property(js_string!("size"), meta.len() as f64, Attribute::all())
        .property(js_string!("mtimeMs"), mtime, Attribute::all())
        .build()
        .into()
}

/// Simple `util.inspect`-like formatting for console output.
fn inspect(v: &JsValue, ctx: &mut Context) -> String {
    if let Some(s) = v.as_string() {
        return s.to_std_string_lossy();
    }
    if v.is_object() && !v.is_callable() {
        if let Ok(json) = ctx
            .global_object()
            .get(js_string!("JSON"), ctx)
            .and_then(|j| j.as_object().unwrap().get(js_string!("stringify"), ctx))
        {
            if let Some(f) = json.as_object() {
                if let Ok(s) = f.call(&JsValue::undefined(), &[v.clone()], ctx) {
                    if let Some(s) = s.as_string() {
                        return s.to_std_string_lossy();
                    }
                }
            }
        }
    }
    v.to_string(ctx).map(|s| s.to_std_string_lossy()).unwrap_or_default()
}

fn format_args(args: &[JsValue], ctx: &mut Context) -> String {
    args.iter().map(|a| inspect(a, ctx)).collect::<Vec<_>>().join(" ")
}

fn install_host(ctx: &mut Context) {
    let host = ObjectInitializer::new(ctx)
        .function(
            NativeFunction::from_fn_ptr(|_, _, ctx| {
                let cwd = std::env::current_dir().unwrap_or_default();
                let _ = ctx;
                Ok(JsString::from(cwd.to_string_lossy().as_ref()).into())
            }),
            js_string!("cwd"),
            0,
        )
        .function(
            NativeFunction::from_fn_ptr(|_, args, ctx| {
                let p = arg_string(args, 0, ctx)?;
                Ok(match super::vfs::read_to_string(Path::new(&p)) {
                    Ok(s) => JsString::from(s.as_str()).into(),
                    Err(e) => io_error_obj(&e, ctx),
                })
            }),
            js_string!("readFile"),
            1,
        )
        .function(
            NativeFunction::from_fn_ptr(|_, args, ctx| {
                let p = arg_string(args, 0, ctx)?;
                if crate::discovery::zipfs::is_special(&p) {
                    return Ok(match super::vfs::kind(Path::new(&p)) {
                        Some(k) => {
                            let size = super::vfs::read(Path::new(&p)).map(|b| b.len()).unwrap_or(0);
                            ObjectInitializer::new(ctx)
                                .property(js_string!("file"), k == super::vfs::Kind::File, Attribute::all())
                                .property(js_string!("dir"), k == super::vfs::Kind::Dir, Attribute::all())
                                .property(js_string!("link"), false, Attribute::all())
                                .property(js_string!("size"), size as f64, Attribute::all())
                                .property(js_string!("mtimeMs"), 0.0, Attribute::all())
                                .build()
                                .into()
                        }
                        None => JsValue::null(),
                    });
                }
                let link = std::fs::symlink_metadata(&p).map(|m| m.file_type().is_symlink()).unwrap_or(false);
                Ok(match std::fs::metadata(&p) {
                    Ok(m) => stat_obj(&m, link, ctx),
                    Err(_) => JsValue::null(),
                })
            }),
            js_string!("stat"),
            1,
        )
        .function(
            NativeFunction::from_fn_ptr(|_, args, ctx| {
                let p = arg_string(args, 0, ctx)?;
                match super::vfs::read_dir(Path::new(&p)) {
                    Ok(mut entries) => {
                        // Node returns entries in byte order of the names.
                        entries.sort_by(|a, b| a.0.as_bytes().cmp(b.0.as_bytes()));
                        let arr = JsArray::new(ctx)?;
                        for (name, file, dir, link) in entries {
                            let o = ObjectInitializer::new(ctx)
                                .property(js_string!("name"), JsString::from(name.as_str()), Attribute::all())
                                .property(js_string!("file"), file, Attribute::all())
                                .property(js_string!("dir"), dir, Attribute::all())
                                .property(js_string!("link"), link, Attribute::all())
                                .build();
                            arr.push(o, ctx)?;
                        }
                        Ok(arr.into())
                    }
                    Err(e) => Ok(io_error_obj(&e, ctx)),
                }
            }),
            js_string!("readDir"),
            1,
        )
        .function(
            NativeFunction::from_fn_ptr(|_, args, ctx| {
                let p = arg_string(args, 0, ctx)?;
                Ok(match super::vfs::canonicalize(Path::new(&p)) {
                    Ok(r) => JsString::from(r.to_string_lossy().as_ref()).into(),
                    Err(_) => JsValue::null(),
                })
            }),
            js_string!("realpath"),
            1,
        )
        .function(
            NativeFunction::from_fn_ptr(|_, args, ctx| {
                let p = arg_string(args, 0, ctx)?;
                let cwd = std::env::current_dir().unwrap_or_default();
                let abs = resolve::normalize(&cwd.join(p));
                Ok(JsString::from(abs.to_string_lossy().as_ref()).into())
            }),
            js_string!("resolvePath"),
            1,
        )
        .function(
            NativeFunction::from_fn_ptr(|_, args, ctx| {
                let p = arg_string(args, 0, ctx)?;
                let trailing = p.ends_with('/');
                let mut n = resolve::normalize(Path::new(&p)).to_string_lossy().into_owned();
                if trailing && !n.ends_with('/') {
                    n.push('/');
                }
                Ok(JsString::from(n.as_str()).into())
            }),
            js_string!("normalizeUrlPath"),
            1,
        )
        .function(
            NativeFunction::from_fn_ptr(|_, args, ctx| {
                let s = arg_string(args, 0, ctx)?;
                let arr = JsArray::new(ctx)?;
                for b in s.as_bytes() {
                    arr.push(*b as i32, ctx)?;
                }
                Ok(arr.into())
            }),
            js_string!("utf8"),
            1,
        )
        .function(
            NativeFunction::from_fn_ptr(|_, args, ctx| {
                Ok(JsString::from(inspect(&args.first().cloned().unwrap_or_default(), ctx).as_str()).into())
            }),
            js_string!("inspect"),
            1,
        )
        .function(
            NativeFunction::from_fn_ptr(|_, args, ctx| Ok(JsString::from(format_args(args, ctx).as_str()).into())),
            js_string!("format"),
            1,
        )
        .function(
            NativeFunction::from_fn_ptr(|_, args, ctx| {
                let s = arg_string(args, 0, ctx)?;
                write_output(s.as_bytes());
                Ok(JsValue::undefined())
            }),
            js_string!("write"),
            1,
        )
        .function(
            NativeFunction::from_fn_ptr(|_, _, _| Ok(now_ms().into())),
            js_string!("now"),
            0,
        )
        .function(
            NativeFunction::from_fn_ptr(|_, args, ctx| {
                let name = arg_string(args, 0, ctx)?;
                let m = loader().builtin(&name, ctx)?;
                evaluate_now(&m, ctx)?;
                Ok(m.namespace(ctx).into())
            }),
            js_string!("builtinNamespace"),
            1,
        )
        .function(
            NativeFunction::from_fn_ptr(|_, _, ctx| {
                ctx.eval(Source::from_bytes(include_str!("inspect.js")))?;
                Ok(JsValue::undefined())
            }),
            js_string!("loadInspect"),
            0,
        )
        .function(
            NativeFunction::from_fn_ptr(|_, args, ctx| {
                let src = match arg_string(args, 0, ctx)?.as_str() {
                    "timers" => GLOBALS_TIMERS,
                    "abort" => GLOBALS_ABORT,
                    "text" => GLOBALS_TEXT,
                    "message" => GLOBALS_MESSAGE,
                    _ => GLOBALS_CLONE,
                };
                ctx.eval(Source::from_bytes(src))?;
                Ok(JsValue::undefined())
            }),
            js_string!("loadGlobals"),
            1,
        )
        .function(
            NativeFunction::from_fn_ptr(|_, _, _| {
                TIMERS_LOADED.with(|t| t.set(true));
                Ok(JsValue::undefined())
            }),
            js_string!("timersLoaded"),
            0,
        )
        .function(
            NativeFunction::from_fn_ptr(|_, args, ctx| {
                let level = arg_string(args, 0, ctx)?;
                let text = arg_string(args, 1, ctx)?;
                let captured = CONSOLE.with(|c| match c.borrow_mut().as_mut() {
                    Some(lines) => {
                        lines.push((level.clone(), text.clone()));
                        true
                    }
                    None => false,
                });
                if !captured {
                    write_output(format!("{text}\n").as_bytes());
                }
                Ok(JsValue::undefined())
            }),
            js_string!("console"),
            2,
        )
        .function(
            NativeFunction::from_fn_ptr(|_, args, ctx| {
                let from = arg_string(args, 0, ctx)?;
                let path = if from.starts_with("file:") {
                    resolve::file_url_to_path(&from).unwrap_or_default()
                } else {
                    PathBuf::from(from)
                };
                make_require(&path, false, 0, ctx)
            }),
            js_string!("createRequire"),
            1,
        )
        .build();
    ctx.register_global_property(js_string!("__astryx_host"), host, Attribute::WRITABLE | Attribute::CONFIGURABLE)
        .expect("host global");



    let env = ObjectInitializer::new(ctx).build();
    for (k, v) in std::env::vars() {
        let _ = env.set(JsString::from(k.as_str()), JsString::from(v.as_str()), false, ctx);
    }
    let stdout = ObjectInitializer::new(ctx)
        .function(
            NativeFunction::from_fn_ptr(|_, args, ctx| {
                let s = arg_string(args, 0, ctx)?;
                write_output(s.as_bytes());
                Ok(true.into())
            }),
            js_string!("write"),
            1,
        )
        .build();
    let stderr = stdout.clone();
    let argv = JsArray::new(ctx).expect("array");
    let process_exit = NativeFunction::from_fn_ptr(|this, args, ctx| {
        let code = match args.first() {
            Some(v) if !v.is_undefined() => v.to_i32(ctx)?,
            _ => this
                .as_object()
                .and_then(|p| p.get(js_string!("exitCode"), ctx).ok())
                .filter(|v| !v.is_undefined())
                .map(|v| v.to_i32(ctx))
                .transpose()?
                .unwrap_or(0),
        };
        EXIT.with(|e| e.set(Some(code)));
        Err(JsNativeError::error().with_message(EXIT_MESSAGE).into())
    });
    let process = ObjectInitializer::new(ctx)
        .property(js_string!("env"), env, Attribute::all())
        .property(js_string!("platform"), js_string!("linux"), Attribute::all())
        .property(js_string!("argv"), argv, Attribute::all())
        .property(js_string!("stdout"), stdout, Attribute::all())
        .property(js_string!("stderr"), stderr, Attribute::all())
        .function(
            NativeFunction::from_fn_ptr(|_, _, _| {
                let cwd = std::env::current_dir().unwrap_or_default();
                Ok(JsString::from(cwd.to_string_lossy().as_ref()).into())
            }),
            js_string!("cwd"),
            0,
        )
        .function(process_exit, js_string!("exit"), 1)
        .build();
    ctx.register_global_property(js_string!("process"), process, Attribute::WRITABLE | Attribute::CONFIGURABLE)
        .expect("process global");
}
