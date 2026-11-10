use std::any::Any;
use std::cell::RefCell;
use std::path::{Component, Path, PathBuf};
use std::rc::Rc;

use dynify::dynify;
use rustc_hash::FxHashMap;

use boa_gc::GcRefCell;
use boa_parser::Source;

use crate::script::Script;
use crate::{
    Context, JsError, JsNativeError, JsResult, JsString, js_error, js_string, object::JsObject,
    realm::Realm, vm::ActiveRunnable,
};

use super::Module;
use crate::module::{ImportAttribute, ModuleRequest};

pub mod embedded;

/// Resolves paths from the referrer and the specifier, normalize the paths and ensure the path
/// is within a base. If the base is empty, that last verification will be skipped.
///
/// The returned specifier is a resolved absolute path that is guaranteed to be
/// a descendant of `base`. All path component that are either empty or `.` and
/// `..` have been resolved.
///
/// # Errors
/// This predicate will return an error if the specifier is relative but the referrer
/// does not have a path, or if the resolved path is outside `base`.
///
/// # Examples
/// ```
/// #[cfg(target_family = "unix")]
/// # {
/// # use std::path::Path;
/// # use boa_engine::{Context, js_string};
/// # use boa_engine::module::resolve_module_specifier;
/// assert_eq!(
///     resolve_module_specifier(
///         Some(Path::new("/base")),
///         &js_string!("../a.js"),
///         Some(Path::new("/base/hello/ref.js")),
///         &mut Context::default()
///     ),
///     Ok("/base/a.js".into())
/// );
/// # }
/// ```
pub fn resolve_module_specifier(
    base: Option<&Path>,
    specifier: &JsString,
    referrer: Option<&Path>,
    _context: &mut Context,
) -> JsResult<PathBuf> {
    let base_path = base.map_or_else(|| PathBuf::from(""), PathBuf::from);
    let referrer_dir = referrer.and_then(|p| p.parent());

    let specifier = specifier.to_std_string_escaped();

    // On Windows, also replace `/` with `\`. JavaScript imports use `/` as path separator.
    #[cfg(target_family = "windows")]
    let specifier = cow_utils::CowUtils::cow_replace(&*specifier, '/', "\\");

    let short_path = Path::new(&*specifier);

    // In ECMAScript, a path is considered relative if it starts with
    // `./` or `../`. In Rust it's any path that start with `/`.
    let is_relative = short_path.starts_with(".") || short_path.starts_with("..");

    let long_path = if is_relative {
        if let Some(r_path) = referrer_dir {
            base_path.join(r_path).join(short_path)
        } else {
            return Err(js_error!(TypeError: "relative path without referrer"));
        }
    } else {
        base_path.join(&*specifier)
    };

    if long_path.is_relative() && base.is_some() {
        return Err(js_error!(TypeError: "resolved path is relative"));
    }

    // Normalize the path. We cannot use `canonicalize` here because it will fail
    // if the path doesn't exist.
    let path = long_path
        .components()
        .filter(|c| c != &Component::CurDir || c == &Component::Normal("".as_ref()))
        .try_fold(PathBuf::new(), |mut acc, c| {
            if c == Component::ParentDir {
                if acc.as_os_str().is_empty() {
                    return Err(js_error!(TypeError: "path is outside the module root"));
                }
                acc.pop();
            } else {
                acc.push(c);
            }
            Ok(acc)
        })?;

    if path.starts_with(&base_path) {
        Ok(path)
    } else {
        Err(js_error!(TypeError: "path is outside the module root"))
    }
}

/// The referrer from which a load request of a module originates.
#[derive(Debug, Clone)]
pub enum Referrer {
    /// A [**Source Text Module Record**](https://tc39.es/ecma262/#sec-source-text-module-records).
    Module(Module),
    /// A [**Realm**](https://tc39.es/ecma262/#sec-code-realms).
    Realm(Realm),
    /// A [**Script Record**](https://tc39.es/ecma262/#sec-script-records)
    Script(Script),
}

impl Referrer {
    /// Gets the path of the referrer, if it has one.
    #[must_use]
    pub fn path(&self) -> Option<&Path> {
        match self {
            Self::Module(module) => module.path(),
            Self::Realm(_) => None,
            Self::Script(script) => script.path(),
        }
    }
}

impl From<ActiveRunnable> for Referrer {
    fn from(value: ActiveRunnable) -> Self {
        match value {
            ActiveRunnable::Script(script) => Self::Script(script),
            ActiveRunnable::Module(module) => Self::Module(module),
        }
    }
}

/// Module loading related host hooks.
///
/// This trait allows to customize the behaviour of the engine on module load requests and
/// `import.meta` requests.
#[dynify]
pub trait ModuleLoader: Any {
    /// Host hook [`HostLoadImportedModule ( referrer, specifier, hostDefined, payload )`][spec].
    ///
    /// This hook allows to customize the module loading functionality of the engine. Technically,
    /// this should call the [`FinishLoadingImportedModule`][finish] operation, but this simpler API just provides
    /// an async method that replaces `FinishLoadingImportedModule`.
    ///
    /// # Requirements
    ///
    /// - The host environment must perform `FinishLoadingImportedModule(referrer, specifier, payload, result)`,
    ///   where result is either a normal completion containing the loaded Module Record or a throw
    ///   completion, either synchronously or asynchronously. This is replaced by simply returning from
    ///   the method.
    /// - If this operation is called multiple times with the same `(referrer, specifier)` pair and
    ///   it performs FinishLoadingImportedModule(referrer, specifier, payload, result) where result
    ///   is a normal completion, then it must perform
    ///   `FinishLoadingImportedModule(referrer, specifier, payload, result)` with the same result each
    ///   time.
    /// - The operation must treat payload as an opaque value to be passed through to
    ///   `FinishLoadingImportedModule`. (can be ignored)
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-HostLoadImportedModule
    /// [finish]: https://tc39.es/ecma262/#sec-FinishLoadingImportedModule
    #[allow(async_fn_in_trait, reason = "all our APIs are single-threaded")]
    async fn load_imported_module(
        self: Rc<Self>,
        referrer: Referrer,
        request: ModuleRequest,
        context: &RefCell<&mut Context>,
    ) -> JsResult<Module>;

    /// Host hooks [`HostGetImportMetaProperties ( moduleRecord )`][meta] and
    /// [`HostFinalizeImportMeta ( importMeta, moduleRecord )`][final].
    ///
    /// This unifies both APIs into a single hook that can be overridden on both cases.
    /// The most common usage is to add properties to `import_meta` and return, but this also
    /// allows modifying the import meta object in more exotic ways before exposing it to ECMAScript
    /// code.
    ///
    /// The default implementation of `HostGetImportMetaProperties` is to return a new empty List.
    ///
    /// [meta]: https://tc39.es/ecma262/#sec-hostgetimportmetaproperties
    /// [final]: https://tc39.es/ecma262/#sec-hostfinalizeimportmeta
    #[allow(unused_variables, reason = "this should be overridden by implementors")]
    fn init_import_meta(
        self: Rc<Self>,
        import_meta: &JsObject,
        module: &Module,
        context: &mut Context,
    ) {
    }
}

/// A module loader that throws when trying to load any modules.
///
/// Useful to disable the module system on platforms that don't have a filesystem, for example.
#[derive(Debug, Clone, Copy)]
pub struct IdleModuleLoader;

impl ModuleLoader for IdleModuleLoader {
    fn load_imported_module(
        self: Rc<Self>,
        _referrer: Referrer,
        _request: ModuleRequest,
        _context: &RefCell<&mut Context>,
    ) -> impl Future<Output = JsResult<Module>> {
        std::future::ready(Err(JsNativeError::typ()
            .with_message("module resolution is disabled for this context")
            .into()))
    }
}

/// A module loader that uses a map of specifier -> Module to resolve.
/// If the module was not registered, it will not be resolved.
///
/// A resolution relative to the referrer is performed when loading a
/// module.
#[derive(Default, Debug, Clone)]
pub struct MapModuleLoader {
    inner: RefCell<FxHashMap<PathBuf, Module>>,
}

impl MapModuleLoader {
    /// Creates an empty map module loader.
    #[must_use]
    #[inline]
    pub fn new() -> Self {
        Self::default()
    }

    /// Insert or replace a mapping in the inner map, returning any previous module
    /// if there was one.
    #[inline]
    pub fn insert(&self, specifier: impl AsRef<str>, module: Module) -> Option<Module> {
        self.inner
            .borrow_mut()
            .insert(PathBuf::from(specifier.as_ref()), module)
    }

    /// Clear the map.
    pub fn clear(&self) {
        self.inner.borrow_mut().clear();
    }
}

impl FromIterator<(String, Module)> for MapModuleLoader {
    fn from_iter<T: IntoIterator<Item = (String, Module)>>(iter: T) -> Self {
        Self {
            inner: RefCell::new(
                iter.into_iter()
                    .map(|(k, v)| (PathBuf::from(k), v))
                    .collect(),
            ),
        }
    }
}

impl ModuleLoader for MapModuleLoader {
    fn load_imported_module(
        self: Rc<Self>,
        referrer: Referrer,
        request: ModuleRequest,
        context: &RefCell<&mut Context>,
    ) -> impl Future<Output = JsResult<Module>> {
        let result = (|| {
            let path = resolve_module_specifier(
                None,
                request.specifier(),
                referrer.path(),
                &mut context.borrow_mut(),
            )?;
            if let Some(module) = self.inner.borrow().get(&path) {
                Ok(module.clone())
            } else {
                Err(js_error!(TypeError: "Module could not be found."))
            }
        })();

        async { result }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct ModuleCacheKey {
    path: PathBuf,
    attributes: Box<[ImportAttribute]>,
}

impl ModuleCacheKey {
    fn new(path: PathBuf, attributes: &[ImportAttribute]) -> Self {
        let mut attributes = attributes.to_vec();
        attributes.sort_unstable_by(|left, right| left.key().cmp(right.key()));
        Self {
            path,
            attributes: attributes.into_boxed_slice(),
        }
    }
}

/// A simple module loader that loads modules relative to a root path.
///
/// # Note
///
/// This loader only works by using the type methods [`SimpleModuleLoader::insert`] and
/// [`SimpleModuleLoader::get`]. The utility methods on [`ModuleLoader`] don't work at the moment,
/// but we'll unify both APIs in the future.
#[derive(Debug)]
pub struct SimpleModuleLoader {
    root: PathBuf,
    module_map: GcRefCell<FxHashMap<ModuleCacheKey, Module>>,
}

impl SimpleModuleLoader {
    /// Creates a new `SimpleModuleLoader` from a root module path.
    pub fn new<P: AsRef<Path>>(root: P) -> JsResult<Self> {
        if cfg!(target_family = "wasm") {
            return Err(JsNativeError::typ()
                .with_message("cannot resolve a relative path in Wasm targets")
                .into());
        }
        let root = root.as_ref();
        let absolute = root.canonicalize().map_err(|e| {
            JsNativeError::typ()
                .with_message(format!("could not set module root `{}`", root.display()))
                .with_cause(JsError::from_rust(e))
        })?;
        Ok(Self {
            root: absolute,
            module_map: GcRefCell::default(),
        })
    }

    /// Inserts a new module onto the module map.
    #[inline]
    pub fn insert(&self, path: PathBuf, module: Module) {
        self.insert_with_attributes(path, &[], module);
    }

    /// Inserts a new module onto the module map with the given attributes.
    #[inline]
    pub fn insert_with_attributes(
        &self,
        path: PathBuf,
        attributes: &[ImportAttribute],
        module: Module,
    ) {
        self.module_map
            .borrow_mut()
            .insert(ModuleCacheKey::new(path, attributes), module);
    }

    /// Gets a module from its original path.
    #[inline]
    pub fn get(&self, path: &Path) -> Option<Module> {
        self.get_with_attributes(path, &[])
    }

    /// Gets a module from its original path and attributes.
    #[inline]
    pub fn get_with_attributes(
        &self,
        path: &Path,
        attributes: &[ImportAttribute],
    ) -> Option<Module> {
        self.module_map
            .borrow()
            .get(&ModuleCacheKey::new(path.to_path_buf(), attributes))
            .cloned()
    }
}

impl ModuleLoader for SimpleModuleLoader {
    fn load_imported_module(
        self: Rc<Self>,
        referrer: Referrer,
        request: ModuleRequest,
        context: &RefCell<&mut Context>,
    ) -> impl Future<Output = JsResult<Module>> {
        let result = (|| {
            let short_path = request.specifier().to_std_string_escaped();
            let path = resolve_module_specifier(
                Some(&self.root),
                request.specifier(),
                referrer.path(),
                &mut context.borrow_mut(),
            )?;

            if let Some(module) = self.get_with_attributes(&path, request.attributes()) {
                return Ok(module);
            }

            // Check for import attribute type
            let mut module_type = None;
            let type_key = js_string!("type");
            for attr in request.attributes() {
                if attr.key() == &type_key {
                    module_type = Some(attr.value());
                }
            }

            if path
                .extension()
                .is_some_and(|ext| ext.to_string_lossy() == "json")
            {
                let is_json_type = module_type.is_some_and(|t| t == &js_string!("json"));
                if !is_json_type {
                    return Err(JsNativeError::typ()
                        .with_message(format!(
                            "module `{short_path}` needs an import attribute of type \"json\""
                        ))
                        .into());
                }
            }
            let module = if let Some(ty) = module_type {
                // Handle different module types based on the type attribute
                match ty.to_std_string_escaped().as_str() {
                    "json" => {
                        // Load and parse as JSON module
                        let json_content = std::fs::read_to_string(&path).map_err(|err| {
                            JsNativeError::typ()
                                .with_message(format!("could not open file `{short_path}`"))
                                .with_cause(JsError::from_rust(err))
                        })?;
                        let json_string = js_string!(json_content.as_str());
                        Module::parse_json(json_string, &mut context.borrow_mut()).map_err(
                            |err| {
                                JsNativeError::syntax()
                                    .with_message(format!(
                                        "could not parse JSON module `{short_path}`"
                                    ))
                                    .with_cause(err)
                            },
                        )?
                    }
                    other => {
                        // Unknown module type
                        return Err(JsNativeError::typ()
                            .with_message(format!(
                                "unsupported module type `{other}` for module `{short_path}`"
                            ))
                            .into());
                    }
                }
            } else {
                // No type attribute, load as regular JavaScript module
                let source = Source::from_filepath(&path).map_err(|err| {
                    JsNativeError::typ()
                        .with_message(format!("could not open file `{short_path}`"))
                        .with_cause(JsError::from_rust(err))
                })?;
                Module::parse(source, None, &mut context.borrow_mut()).map_err(|err| {
                    JsNativeError::syntax()
                        .with_message(format!("could not parse module `{short_path}`"))
                        .with_cause(err)
                })?
            };

            self.insert_with_attributes(path, request.attributes(), module.clone());
            Ok(module)
        })();

        async { result }
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use test_case::test_case;

    use super::*;

    // Tests on Windows and Linux are different because of the path separator and the definition
    // of absolute paths.
    #[rustfmt::skip]
    #[cfg(target_family = "unix")]
    #[test_case(Some("/hello/ref.js"),      "a.js",             Ok("/base/a.js"))]
    #[test_case(Some("/base/ref.js"),       "./b.js",           Ok("/base/b.js"))]
    #[test_case(Some("/base/other/ref.js"), "./c.js",           Ok("/base/other/c.js"))]
    #[test_case(Some("/base/other/ref.js"), "../d.js",          Ok("/base/d.js"))]
    #[test_case(Some("/base/ref.js"),        "e.js",            Ok("/base/e.js"))]
    #[test_case(Some("/base/ref.js"),        "./f.js",          Ok("/base/f.js"))]
    #[test_case(Some("./ref.js"),           "./g.js",           Ok("/base/g.js"))]
    #[test_case(Some("./other/ref.js"),     "./other/h.js",     Ok("/base/other/other/h.js"))]
    #[test_case(Some("./other/ref.js"),     "./other/../h1.js", Ok("/base/other/h1.js"))]
    #[test_case(Some("./other/ref.js"),     "./../h2.js",       Ok("/base/h2.js"))]
    #[test_case(None,                       "./i.js",           Err(()))]
    #[test_case(None,                       "j.js",             Ok("/base/j.js"))]
    #[test_case(None,                       "other/k.js",       Ok("/base/other/k.js"))]
    #[test_case(None,                       "other/../../l.js", Err(()))]
    #[test_case(Some("/base/ref.js"),       "other/../../m.js", Err(()))]
    #[test_case(None,                       "../n.js",          Err(()))]
    fn resolve_test(ref_path: Option<&str>, spec: &str, expected: Result<&str, ()>) {
        let base = PathBuf::from("/base");

        let mut context = Context::default();
        let spec = js_string!(spec);
        let ref_path = ref_path.map(PathBuf::from);

        let actual = resolve_module_specifier(
            Some(&base),
            &spec,
            ref_path.as_deref(),
            &mut context,
        );
        assert_eq!(actual.map_err(|_| ()), expected.map(PathBuf::from));
    }

    // This tests the same cases as the previous test, but without a base path.
    #[rustfmt::skip]
    #[cfg(target_family = "unix")]
    #[test_case(Some("hello/ref.js"),       "a.js",             Ok("a.js"))]
    #[test_case(Some("base/ref.js"),        "./b.js",           Ok("base/b.js"))]
    #[test_case(Some("base/other/ref.js"),  "./c.js",           Ok("base/other/c.js"))]
    #[test_case(Some("base/other/ref.js"),  "../d.js",          Ok("base/d.js"))]
    #[test_case(Some("base/ref.js"),        "e.js",             Ok("e.js"))]
    #[test_case(Some("base/ref.js"),        "./f.js",           Ok("base/f.js"))]
    #[test_case(Some("./ref.js"),           "./g.js",           Ok("g.js"))]
    #[test_case(Some("./other/ref.js"),     "./other/h.js",     Ok("other/other/h.js"))]
    #[test_case(Some("./other/ref.js"),     "./other/../h1.js", Ok("other/h1.js"))]
    #[test_case(Some("./other/ref.js"),     "./../h2.js",       Ok("h2.js"))]
    #[test_case(None,                       "./i.js",           Err(()))]
    #[test_case(None,                       "j.js",             Ok("j.js"))]
    #[test_case(None,                       "other/k.js",       Ok("other/k.js"))]
    #[test_case(None,                       "other/../../l.js", Err(()))]
    #[test_case(Some("/base/ref.js"),       "other/../../m.js", Err(()))]
    #[test_case(None,                       "../n.js",          Err(()))]
    fn resolve_test_no_base(ref_path: Option<&str>, spec: &str, expected: Result<&str, ()>) {
        let mut context = Context::default();
        let spec = js_string!(spec);
        let ref_path = ref_path.map(PathBuf::from);

        let actual = resolve_module_specifier(
            None,
            &spec,
            ref_path.as_deref(),
            &mut context,
        );
        assert_eq!(actual.map_err(|_| ()), expected.map(PathBuf::from));
    }

    #[rustfmt::skip]
    #[cfg(target_family = "windows")]
    #[test_case(Some("a:\\hello\\ref.js"),       "a.js",                Ok("a:\\base\\a.js"))]
    #[test_case(Some("a:\\base\\ref.js"),        "./b.js",              Ok("a:\\base\\b.js"))]
    #[test_case(Some("a:\\base\\other\\ref.js"), "./c.js",              Ok("a:\\base\\other\\c.js"))]
    #[test_case(Some("a:\\base\\other\\ref.js"), "../d.js",             Ok("a:\\base\\d.js"))]
    #[test_case(Some("a:\\base\\ref.js"),        "e.js",                Ok("a:\\base\\e.js"))]
    #[test_case(Some("a:\\base\\ref.js"),        "./f.js",              Ok("a:\\base\\f.js"))]
    #[test_case(Some(".\\ref.js"),               "./g.js",              Ok("a:\\base\\g.js"))]
    #[test_case(Some(".\\other\\ref.js"),        "./other/h.js",        Ok("a:\\base\\other\\other\\h.js"))]
    #[test_case(Some(".\\other\\ref.js"),        "./other/../h1.js",    Ok("a:\\base\\other\\h1.js"))]
    #[test_case(Some(".\\other\\ref.js"),        "./../h2.js",          Ok("a:\\base\\h2.js"))]
    #[test_case(None,                            "./i.js",              Err(()))]
    #[test_case(None,                            "j.js",                Ok("a:\\base\\j.js"))]
    #[test_case(None,                            "other/k.js",          Ok("a:\\base\\other\\k.js"))]
    #[test_case(None,                            "other/../../l.js",    Err(()))]
    #[test_case(Some("\\base\\ref.js"),          "other/../../m.js",    Err(()))]
    #[test_case(None,                            "../n.js",             Err(()))]
    fn resolve_test(ref_path: Option<&str>, spec: &str, expected: Result<&str, ()>) {
        let base = PathBuf::from("a:\\base");

        let mut context = Context::default();
        let spec = js_string!(spec);
        let ref_path = ref_path.map(PathBuf::from);

        let actual = resolve_module_specifier(
            Some(&base),
            &spec,
            ref_path.as_deref(),
            &mut context,
        );
        assert_eq!(actual.map_err(|_| ()), expected.map(PathBuf::from));
    }
}
