//! Boa's implementation of the ECMAScript's module system.
//!
//! This module contains the [`Module`] type, which represents an [**Abstract Module Record**][module],
//! a [`ModuleLoader`] trait for custom module loader implementations, and [`SimpleModuleLoader`],
//! the default `ModuleLoader` for [`Context`] which can be used for most simple usecases.
//!
//! Every module roughly follows the same lifecycle:
//! - Parse using [`Module::parse`].
//! - Load all its dependencies using [`Module::load`].
//! - Link its dependencies together using [`Module::link`].
//! - Evaluate the module and its dependencies using [`Module::evaluate`].
//!
//! The [`ModuleLoader`] trait allows customizing the "load" step on the lifecycle
//! of a module, which allows doing things like fetching modules from urls, having multiple
//! "modpaths" from where to import modules, or using Rust futures to avoid blocking the main thread
//! on loads.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-modules
//! [module]: https://tc39.es/ecma262/#sec-abstract-module-records

use std::cell::{Cell, RefCell};
use std::collections::HashSet;
use std::hash::Hash;
use std::path::{Path, PathBuf};
use std::rc::Rc;

use rustc_hash::FxHashSet;

use boa_ast::declaration::ImportAttribute as AstImportAttribute;
use boa_engine::js_string;
use boa_engine::property::PropertyKey;
use boa_engine::value::TryFromJs;
use boa_gc::{Finalize, Gc, GcRefCell, Trace};
use boa_interner::Interner;
use boa_parser::source::ReadChar;
use boa_parser::{Parser, Source};

pub use loader::*;
pub use namespace::ModuleNamespace;
use source::SourceTextModule;
pub use synthetic::{SyntheticModule, SyntheticModuleInitializer};

use crate::bytecompiler::ToJsString;
use crate::object::TypedJsFunction;
use crate::spanned_source_text::SourceText;
use crate::{
    Context, HostDefined, JsError, JsNativeError, JsResult, JsString, JsValue, NativeFunction,
    builtins,
    builtins::promise::{PromiseCapability, PromiseState},
    environments::DeclarativeEnvironment,
    object::{JsObject, JsPromise},
    realm::Realm,
};

mod loader;
mod namespace;
mod source;
mod synthetic;

/// Import attribute.
///
/// [spec]: https://tc39.es/ecma262/#table-importattribute-fields
#[derive(Debug, Clone, PartialEq, Eq, Hash, Trace, Finalize)]
pub struct ImportAttribute {
    key: JsString,
    value: JsString,
}

impl ImportAttribute {
    /// Creates a new import attribute.
    #[must_use]
    pub fn new(key: JsString, value: JsString) -> Self {
        Self { key, value }
    }

    /// Gets the attribute key.
    #[must_use]
    pub fn key(&self) -> &JsString {
        &self.key
    }

    /// Gets the attribute value.
    #[must_use]
    pub fn value(&self) -> &JsString {
        &self.value
    }
}

/// A module request with optional import attributes.
///
/// Represents a module specifier and its associated import attributes.
/// According to the [ECMAScript specification][spec], the module cache key
/// should be (referrer, specifier, attributes).
///
/// [spec]: https://tc39.es/ecma262/#sec-modulerequest-record
#[derive(Debug, Clone, PartialEq, Eq, Hash, Trace, Finalize)]
pub struct ModuleRequest {
    specifier: JsString,
    attributes: Box<[ImportAttribute]>,
}

impl ModuleRequest {
    /// Creates a new module request from a specifier and attributes.
    #[must_use]
    pub fn new(specifier: JsString, mut attributes: Box<[ImportAttribute]>) -> Self {
        // Sort attributes by key to ensure canonical cache keys.
        attributes.sort_unstable_by(|k1, k2| k1.key.cmp(&k2.key));
        Self {
            specifier,
            attributes,
        }
    }

    /// Creates a new module request from only a specifier with no attributes.
    #[must_use]
    pub fn from_specifier(specifier: JsString) -> Self {
        Self {
            specifier,
            attributes: Box::default(),
        }
    }

    /// Creates a new module request from an AST specifier and attributes.
    #[must_use]
    pub(crate) fn from_ast(
        specifier: JsString,
        attributes: &[AstImportAttribute],
        interner: &Interner,
    ) -> Self {
        let attributes = attributes
            .iter()
            .map(|attr| {
                ImportAttribute::new(
                    attr.key().to_js_string(interner),
                    attr.value().to_js_string(interner),
                )
            })
            .collect::<Vec<_>>()
            .into_boxed_slice();
        Self::new(specifier, attributes)
    }

    /// Gets the module specifier.
    #[must_use]
    pub fn specifier(&self) -> &JsString {
        &self.specifier
    }

    /// Gets the import attributes as key-value pairs.
    #[must_use]
    pub fn attributes(&self) -> &[ImportAttribute] {
        &self.attributes
    }

    /// Gets the value of a specific attribute by key.
    #[must_use]
    pub fn get_attribute(&self, key: &str) -> Option<&JsString> {
        self.attributes
            .iter()
            .find(|attr| attr.key == key)
            .map(|attr| &attr.value)
    }
}

/// ECMAScript's [**Abstract module record**][spec].
///
/// [spec]: https://tc39.es/ecma262/#sec-abstract-module-records
#[derive(Clone, Trace, Finalize)]
pub struct Module {
    inner: Gc<ModuleRepr>,
}

impl std::fmt::Debug for Module {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Module")
            .field("realm", &self.inner.realm.addr())
            .field("namespace", &self.inner.namespace)
            .field("kind", &self.inner.kind)
            .finish()
    }
}

#[derive(Trace, Finalize)]
struct ModuleRepr {
    realm: Realm,
    namespace: GcRefCell<Option<JsObject>>,
    kind: ModuleKind,
    host_defined: HostDefined,
    path: Option<PathBuf>,
}

/// The kind of a [`Module`].
#[derive(Debug, Trace, Finalize)]
pub(crate) enum ModuleKind {
    /// A [**Source Text Module Record**](https://tc39.es/ecma262/#sec-source-text-module-records)
    SourceText(Box<SourceTextModule>),
    /// A [**Synthetic Module Record**](https://tc39.es/proposal-json-modules/#sec-synthetic-module-records)
    Synthetic(Box<SyntheticModule>),
}

impl ModuleKind {
    /// Returns the inner `SourceTextModule`.
    pub(crate) fn as_source_text(&self) -> Option<&SourceTextModule> {
        match self {
            ModuleKind::SourceText(src) => Some(src),
            ModuleKind::Synthetic(_) => None,
        }
    }
}

/// Return value of the [`Module::resolve_export`] operation.
///
/// Indicates how to access a specific export in a module.
#[derive(Debug, Clone)]
pub(crate) struct ResolvedBinding {
    module: Module,
    binding_name: BindingName,
}

/// The local name of the resolved binding within its containing module.
///
/// Note that a resolved binding can resolve to a single binding inside a module (`export var a = 1"`)
/// or to a whole module namespace (`export * as ns from "mod.js"`).
#[derive(Debug, Clone)]
pub(crate) enum BindingName {
    /// A local binding.
    Name(JsString),
    /// The whole namespace of the containing module.
    Namespace,
}

impl ResolvedBinding {
    /// Gets the module from which the export resolved.
    pub(crate) const fn module(&self) -> &Module {
        &self.module
    }

    /// Consumes `self` and returns the module from which the export resolved.
    pub(crate) fn into_module(self) -> Module {
        self.module
    }

    /// Gets a reference to the binding associated with the resolved export.
    pub(crate) const fn binding_name(&self) -> &BindingName {
        &self.binding_name
    }
}

#[derive(Debug, Clone)]
struct GraphLoadingState {
    capability: PromiseCapability,
    loading: Cell<bool>,
    pending_modules: Cell<usize>,
    visited: RefCell<HashSet<Module>>,
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum ResolveExportError {
    NotFound,
    Ambiguous,
}

impl Module {
    /// Abstract operation [`ParseModule ( sourceText, realm, hostDefined )`][spec].
    ///
    /// Parses the provided `src` as an ECMAScript module, returning an error if parsing fails.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-parsemodule
    pub fn parse<R: ReadChar>(
        src: Source<'_, R>,
        realm: Option<Realm>,
        context: &mut Context,
    ) -> JsResult<Self> {
        let path = src.path().map(Path::to_path_buf);
        let realm = realm.unwrap_or_else(|| context.realm().clone());

        let mut parser = Parser::new(src);
        parser.set_identifier(context.next_parser_identifier());
        let (module, source) =
            parser.parse_module_with_source(realm.scope(), context.interner_mut())?;

        let source_text = SourceText::new(source);
        let src = SourceTextModule::new(module, context.interner(), source_text, path.clone());

        Ok(Self {
            inner: Gc::new(ModuleRepr {
                realm,
                namespace: GcRefCell::default(),
                kind: ModuleKind::SourceText(Box::new(src)),
                host_defined: HostDefined::default(),
                path,
            }),
        })
    }

    /// Abstract operation [`CreateSyntheticModule ( exportNames, evaluationSteps, realm )`][spec].
    ///
    /// Creates a new Synthetic Module from its list of exported names, its evaluation steps and
    /// optionally a root realm.
    ///
    /// [spec]: https://tc39.es/proposal-json-modules/#sec-createsyntheticmodule
    #[inline]
    pub fn synthetic(
        export_names: &[JsString],
        evaluation_steps: SyntheticModuleInitializer,
        path: Option<PathBuf>,
        realm: Option<Realm>,
        context: &mut Context,
    ) -> Self {
        let names = export_names.iter().cloned().collect();
        let realm = realm.unwrap_or_else(|| context.realm().clone());
        let synth = SyntheticModule::new(names, evaluation_steps);

        Self {
            inner: Gc::new(ModuleRepr {
                realm,
                namespace: GcRefCell::default(),
                kind: ModuleKind::Synthetic(Box::new(synth)),
                host_defined: HostDefined::default(),
                path,
            }),
        }
    }

    /// Create a [`Module`] from a `JsValue`, exporting that value as the default export.
    /// This will clone the module everytime it is initialized.
    pub fn from_value_as_default(value: JsValue, context: &mut Context) -> Self {
        Module::synthetic(
            &[js_string!("default")],
            SyntheticModuleInitializer::from_copy_closure_with_captures(
                move |m, value, _ctx| {
                    m.set_export(&js_string!("default"), value.clone())?;
                    Ok(())
                },
                value,
            ),
            None,
            None,
            context,
        )
    }

    /// Create a module that exports a single JSON value as the default export, from its
    /// JSON string.
    ///
    /// # Specification
    /// This is a custom extension to the ECMAScript specification. The current proposal
    /// for JSON modules is being considered in <https://github.com/tc39/proposal-json-modules>
    /// and might differ from this implementation.
    ///
    /// This method is provided as a convenience for hosts to create JSON modules.
    ///
    /// # Errors
    /// This will return an error if the JSON string is invalid or cannot be converted.
    pub fn parse_json(json: JsString, context: &mut Context) -> JsResult<Self> {
        let value = builtins::Json::parse(&JsValue::undefined(), &[json.into()], context)?;
        Ok(Self::from_value_as_default(value, context))
    }

    /// Gets the realm of this `Module`.
    #[inline]
    #[must_use]
    pub fn realm(&self) -> &Realm {
        &self.inner.realm
    }

    /// Returns the [`ECMAScript specification`][spec] defined [`\[\[HostDefined\]\]`][`HostDefined`] field of the [`Module`].
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-abstract-module-records
    #[inline]
    #[must_use]
    pub fn host_defined(&self) -> &HostDefined {
        &self.inner.host_defined
    }

    /// Gets the kind of this `Module`.
    pub(crate) fn kind(&self) -> &ModuleKind {
        &self.inner.kind
    }

    /// Gets the declarative environment of this `Module`.
    pub(crate) fn environment(&self) -> Option<Gc<DeclarativeEnvironment>> {
        match self.kind() {
            ModuleKind::SourceText(src) => src.environment(),
            ModuleKind::Synthetic(syn) => syn.environment(),
        }
    }

    /// Abstract method [`LoadRequestedModules ( [ hostDefined ] )`][spec].
    ///
    /// Prepares the module for linking by loading all its module dependencies. Returns a `JsPromise`
    /// that will resolve when the loading process either completes or fails.
    ///
    /// [spec]: https://tc39.es/ecma262/#table-abstract-methods-of-module-records
    #[allow(clippy::missing_panics_doc)]
    #[inline]
    pub fn load(&self, context: &mut Context) -> JsPromise {
        match self.kind() {
            ModuleKind::SourceText(_) => {
                // Concrete method [`LoadRequestedModules ( [ hostDefined ] )`][spec].
                //
                // [spec]: https://tc39.es/ecma262/#sec-LoadRequestedModules
                // 1. If hostDefined is not present, let hostDefined be empty.

                // 2. Let pc be ! NewPromiseCapability(%Promise%).
                let pc = PromiseCapability::new(
                    &context.intrinsics().constructors().promise().constructor(),
                    context,
                )
                .expect(
                    "capability creation must always succeed when using the `%Promise%` intrinsic",
                );

                // 4. Perform InnerModuleLoading(state, module).
                self.inner_load(
                    // 3. Let state be the GraphLoadingState Record {
                    //     [[IsLoading]]: true, [[PendingModulesCount]]: 1, [[Visited]]: « »,
                    //     [[PromiseCapability]]: pc, [[HostDefined]]: hostDefined
                    // }.
                    &Rc::new(GraphLoadingState {
                        capability: pc.clone(),
                        loading: Cell::new(true),
                        pending_modules: Cell::new(1),
                        visited: RefCell::default(),
                    }),
                    context,
                );

                // 5. Return pc.[[Promise]].
                JsPromise::from_object(pc.promise().clone())
                    .expect("promise created from the %Promise% intrinsic is always native")
            }
            ModuleKind::Synthetic(_) => SyntheticModule::load(context),
        }
    }

    /// Abstract operation [`InnerModuleLoading`][spec].
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-InnerModuleLoading
    fn inner_load(&self, state: &Rc<GraphLoadingState>, context: &mut Context) {
        // 1. Assert: state.[[IsLoading]] is true.
        assert!(state.loading.get());

        if let ModuleKind::SourceText(src) = self.kind() {
            // continues on `inner_load
            src.inner_load(self, state, context);
            if !state.loading.get() {
                return;
            }
        }

        // 3. Assert: state.[[PendingModulesCount]] ≥ 1.
        assert!(state.pending_modules.get() >= 1);

        // 4. Set state.[[PendingModulesCount]] to state.[[PendingModulesCount]] - 1.
        state.pending_modules.set(state.pending_modules.get() - 1);
        // 5. If state.[[PendingModulesCount]] = 0, then

        if state.pending_modules.get() == 0 {
            // a. Set state.[[IsLoading]] to false.
            state.loading.set(false);
            // b. For each Cyclic Module Record loaded of state.[[Visited]], do
            //    i. If loaded.[[Status]] is new, set loaded.[[Status]] to unlinked.
            // By default, all modules start on `unlinked`.

            // c. Perform ! Call(state.[[PromiseCapability]].[[Resolve]], undefined, « undefined »).
            state
                .capability
                .resolve()
                .call(&JsValue::undefined(), &[], context)
                .expect("marking a module as loaded should not fail");
        }
        // 6. Return unused.
    }

    /// Abstract method [`GetExportedNames([exportStarSet])`][spec].
    ///
    /// Returns a list of all the names exported from this module.
    ///
    /// # Note
    ///
    /// This must only be called if the [`JsPromise`] returned by [`Module::load`] has fulfilled.
    ///
    /// [spec]: https://tc39.es/ecma262/#table-abstract-methods-of-module-records
    fn get_exported_names(
        &self,
        export_star_set: &mut Vec<Module>,
        interner: &Interner,
    ) -> FxHashSet<JsString> {
        match self.kind() {
            ModuleKind::SourceText(src) => src.get_exported_names(self, export_star_set, interner),
            ModuleKind::Synthetic(synth) => synth.get_exported_names(),
        }
    }

    /// Abstract method [`ResolveExport(exportName [, resolveSet])`][spec].
    ///
    /// Returns the corresponding local binding of a binding exported by this module.
    /// The spec requires that this operation must be idempotent; calling this multiple times
    /// with the same `export_name` and `resolve_set` should always return the same result.
    ///
    /// # Note
    ///
    /// This must only be called if the [`JsPromise`] returned by [`Module::load`] has fulfilled.
    ///
    /// [spec]: https://tc39.es/ecma262/#table-abstract-methods-of-module-records
    #[allow(clippy::mutable_key_type)]
    pub(crate) fn resolve_export(
        &self,
        export_name: &JsString,
        resolve_set: &mut FxHashSet<(Self, JsString)>,
        interner: &Interner,
    ) -> Result<ResolvedBinding, ResolveExportError> {
        match self.kind() {
            ModuleKind::SourceText(src) => {
                src.resolve_export(self, export_name, resolve_set, interner)
            }
            ModuleKind::Synthetic(synth) => synth.resolve_export(self, export_name),
        }
    }

    /// Abstract method [`Link() `][spec].
    ///
    /// Prepares this module for evaluation by resolving all its module dependencies and initializing
    /// its environment.
    ///
    /// # Note
    ///
    /// This must only be called if the [`JsPromise`] returned by [`Module::load`] has fulfilled.
    ///
    /// [spec]: https://tc39.es/ecma262/#table-abstract-methods-of-module-records
    #[allow(clippy::missing_panics_doc)]
    #[inline]
    pub fn link(&self, context: &mut Context) -> JsResult<()> {
        match self.kind() {
            ModuleKind::SourceText(src) => src.link(self, context),
            ModuleKind::Synthetic(synth) => {
                synth.link(self, context);
                Ok(())
            }
        }
    }

    /// Abstract operation [`InnerModuleLinking ( module, stack, index )`][spec].
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-InnerModuleLinking
    fn inner_link(
        &self,
        stack: &mut Vec<Module>,
        index: usize,
        context: &mut Context,
    ) -> JsResult<usize> {
        match self.kind() {
            ModuleKind::SourceText(src) => src.inner_link(self, stack, index, context),
            // If module is not a Cyclic Module Record, then
            ModuleKind::Synthetic(synth) => {
                // a. Perform ? module.Link().
                synth.link(self, context);
                // b. Return index.
                Ok(index)
            }
        }
    }

    /// Abstract method [`Evaluate()`][spec].
    ///
    /// Evaluates this module, returning a promise for the result of the evaluation of this module
    /// and its dependencies.
    /// If the promise is rejected, hosts are expected to handle the promise rejection and rethrow
    /// the evaluation error.
    ///
    /// # Note
    ///
    /// This must only be called if the [`Module::link`] method finished successfully.
    ///
    /// [spec]: https://tc39.es/ecma262/#table-abstract-methods-of-module-records
    #[inline]
    pub fn evaluate(&self, context: &mut Context) -> JsResult<JsPromise> {
        match self.kind() {
            ModuleKind::SourceText(src) => src.evaluate(self, context),
            ModuleKind::Synthetic(synth) => synth.evaluate(self, context),
        }
    }

    /// Abstract operation [`InnerModuleLinking ( module, stack, index )`][spec].
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-InnerModuleLinking
    fn inner_evaluate(
        &self,
        stack: &mut Vec<Module>,
        index: usize,
        context: &mut Context,
    ) -> JsResult<usize> {
        match self.kind() {
            ModuleKind::SourceText(src) => src.inner_evaluate(self, stack, index, None, context),
            // 1. If module is not a Cyclic Module Record, then
            ModuleKind::Synthetic(synth) => {
                // a. Let promise be ! module.Evaluate().
                let promise: JsPromise = synth.evaluate(self, context)?;
                let state = promise.state();
                match state {
                    PromiseState::Pending => {
                        unreachable!("b. Assert: promise.[[PromiseState]] is not pending.")
                    }
                    // d. Return index.
                    PromiseState::Fulfilled(_) => Ok(index),
                    // c. If promise.[[PromiseState]] is rejected, then
                    //    i. Return ThrowCompletion(promise.[[PromiseResult]]).
                    PromiseState::Rejected(err) => Err(JsError::from_opaque(err)),
                }
            }
        }
    }

    /// Loads, links and evaluates this module, returning a promise that will resolve after the module
    /// finishes its lifecycle.
    ///
    /// # Examples
    /// ```
    /// # use std::{path::Path, rc::Rc};
    /// # use boa_engine::{Context, Source, Module, JsValue};
    /// # use boa_engine::builtins::promise::PromiseState;
    /// # use boa_engine::module::{ModuleLoader, SimpleModuleLoader};
    /// let loader = Rc::new(SimpleModuleLoader::new(Path::new(".")).unwrap());
    /// let mut context = &mut Context::builder()
    ///     .module_loader(loader.clone())
    ///     .build()
    ///     .unwrap();
    ///
    /// let source = Source::from_bytes("1 + 3");
    ///
    /// let module = Module::parse(source, None, context).unwrap();
    ///
    /// loader.insert(Path::new("main.mjs").to_path_buf(), module.clone());
    ///
    /// let promise = module.load_link_evaluate(context);
    ///
    /// context.run_jobs().unwrap();
    ///
    /// assert_eq!(
    ///     promise.state(),
    ///     PromiseState::Fulfilled(JsValue::undefined())
    /// );
    /// ```
    #[allow(dropping_copy_types)]
    #[inline]
    pub fn load_link_evaluate(&self, context: &mut Context) -> JsPromise {
        self.load(context)
            .then(
                Some(
                    NativeFunction::from_copy_closure_with_captures(
                        |_, _, module, context| {
                            module.link(context)?;
                            Ok(JsValue::undefined())
                        },
                        self.clone(),
                    )
                    .to_js_function(context.realm()),
                ),
                None,
                context,
            )
            .expect("`then` cannot fail for a native `JsPromise`")
            .then(
                Some(
                    NativeFunction::from_copy_closure_with_captures(
                        |_, _, module, context| Ok(module.evaluate(context)?.into()),
                        self.clone(),
                    )
                    .to_js_function(context.realm()),
                ),
                None,
                context,
            )
            .expect("`then` cannot fail for a native `JsPromise`")
    }

    /// Abstract operation [`GetModuleNamespace ( module )`][spec].
    ///
    /// Gets the [**Module Namespace Object**][ns] that represents this module's exports.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-getmodulenamespace
    /// [ns]: https://tc39.es/ecma262/#sec-module-namespace-exotic-objects
    pub fn namespace(&self, context: &mut Context) -> JsObject {
        // 1. Assert: If module is a Cyclic Module Record, then module.[[Status]] is not new or unlinked.
        // 2. Let namespace be module.[[Namespace]].
        // 3. If namespace is empty, then
        // 4. Return namespace.
        self.inner
            .namespace
            .borrow_mut()
            .get_or_insert_with(|| {
                // a. Let exportedNames be module.GetExportedNames().
                let exported_names =
                    self.get_exported_names(&mut Vec::default(), context.interner());

                // b. Let unambiguousNames be a new empty List.
                let unambiguous_names = exported_names
                    .into_iter()
                    // c. For each element name of exportedNames, do
                    .filter_map(|name| {
                        // i. Let resolution be module.ResolveExport(name).
                        // ii. If resolution is a ResolvedBinding Record, append name to unambiguousNames.
                        self.resolve_export(&name, &mut HashSet::default(), context.interner())
                            .ok()
                            .map(|_| name)
                    })
                    .collect();

                //     d. Set namespace to ModuleNamespaceCreate(module, unambiguousNames).
                ModuleNamespace::create(self.clone(), unambiguous_names, context)
            })
            .clone()
    }

    /// Get an exported value from the module.
    #[inline]
    pub fn get_value<K>(&self, name: K, context: &mut Context) -> JsResult<JsValue>
    where
        K: Into<PropertyKey>,
    {
        let namespace = self.namespace(context);
        namespace.get(name, context)
    }

    /// Get an exported function, typed, from the module.
    #[inline]
    #[allow(clippy::needless_pass_by_value)]
    pub fn get_typed_fn<A, R>(
        &self,
        name: JsString,
        context: &mut Context,
    ) -> JsResult<TypedJsFunction<A, R>>
    where
        A: crate::object::TryIntoJsArguments,
        R: TryFromJs,
    {
        let func = self.get_value(name.clone(), context)?;
        let func = func.as_function().ok_or_else(|| {
            JsNativeError::typ().with_message(format!("{name:?} is not a function"))
        })?;
        Ok(func.typed())
    }

    /// Returns the path of the module, if it was created from a file or assigned.
    #[must_use]
    pub fn path(&self) -> Option<&Path> {
        self.inner.path.as_deref()
    }
}

impl PartialEq for Module {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        Gc::ptr_eq(&self.inner, &other.inner)
    }
}

impl Eq for Module {}

impl Hash for Module {
    #[inline]
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        std::ptr::hash(self.inner.as_ref(), state);
    }
}

/// A trait to convert a type into a JS module.
pub trait IntoJsModule {
    /// Converts the type into a JS module.
    fn into_js_module(self, context: &mut Context) -> Module;
}

impl<T: IntoIterator<Item = (JsString, NativeFunction)> + Clone> IntoJsModule for T {
    fn into_js_module(self, context: &mut Context) -> Module {
        let (names, fns): (Vec<_>, Vec<_>) = self.into_iter().unzip();
        let exports = names.clone();

        Module::synthetic(
            exports.as_slice(),
            unsafe {
                SyntheticModuleInitializer::from_closure(move |module, context| {
                    for (name, f) in names.iter().zip(fns.iter()) {
                        module
                            .set_export(name, f.clone().to_js_function(context.realm()).into())?;
                    }
                    Ok(())
                })
            },
            None,
            None,
            context,
        )
    }
}

#[test]
#[allow(clippy::missing_panics_doc)]
fn into_js_module() {
    use boa_engine::interop::{ContextData, JsRest};
    use boa_engine::{
        Context, IntoJsFunctionCopied, JsValue, Module, Source, UnsafeIntoJsFunction, js_string,
    };
    use boa_gc::{Gc, GcRefCell};
    use std::cell::RefCell;
    use std::rc::Rc;

    type ResultType = Gc<GcRefCell<JsValue>>;

    let loader = Rc::new(MapModuleLoader::default());
    let mut context = Context::builder()
        .module_loader(loader.clone())
        .build()
        .unwrap();

    let foo_count = Rc::new(RefCell::new(0));
    let bar_count = Rc::new(RefCell::new(0));
    let dad_count = Rc::new(RefCell::new(0));

    context.insert_data(Gc::new(GcRefCell::new(JsValue::undefined())));

    let module = unsafe {
        vec![
            (
                js_string!("foo"),
                {
                    let counter = foo_count.clone();
                    move || {
                        *counter.borrow_mut() += 1;

                        *counter.borrow()
                    }
                }
                .into_js_function_unsafe(&mut context),
            ),
            (
                js_string!("bar"),
                UnsafeIntoJsFunction::into_js_function_unsafe(
                    {
                        let counter = bar_count.clone();
                        move |i: i32| {
                            *counter.borrow_mut() += i;
                        }
                    },
                    &mut context,
                ),
            ),
            (
                js_string!("dad"),
                UnsafeIntoJsFunction::into_js_function_unsafe(
                    {
                        let counter = dad_count.clone();
                        move |args: JsRest<'_>, context: &mut Context| {
                            *counter.borrow_mut() += args
                                .into_iter()
                                .map(|i| i.try_js_into::<i32>(context).unwrap())
                                .sum::<i32>();
                        }
                    },
                    &mut context,
                ),
            ),
            (
                js_string!("send"),
                (move |value: JsValue, ContextData(result): ContextData<ResultType>| {
                    *result.borrow_mut() = value;
                })
                .into_js_function_copied(&mut context),
            ),
        ]
    }
    .into_js_module(&mut context);

    loader.insert("test", module);

    let source = Source::from_bytes(
        r"
            import * as test from 'test';
            let result = test.foo();
            test.foo();
            for (let i = 1; i <= 5; i++) {
                test.bar(i);
            }
            for (let i = 1; i < 5; i++) {
                test.dad(1, 2, 3);
            }

            test.send(result);
        ",
    );
    let root_module = Module::parse(source, None, &mut context).unwrap();

    let promise_result = root_module.load_link_evaluate(&mut context);
    context.run_jobs().unwrap();

    // Checking if the final promise didn't return an error.
    assert!(
        promise_result.state().as_fulfilled().is_some(),
        "module didn't execute successfully! Promise: {:?}",
        promise_result.state()
    );

    let result = context.get_data::<ResultType>().unwrap().borrow().clone();

    assert_eq!(*foo_count.borrow(), 2);
    assert_eq!(*bar_count.borrow(), 15);
    assert_eq!(*dad_count.borrow(), 24);
    assert_eq!(result.try_js_into(&mut context), Ok(1u32));
}

#[test]
fn can_throw_exception() {
    use boa_engine::{
        Context, IntoJsFunctionCopied, JsError, JsResult, JsValue, Module, Source, js_string,
    };
    use std::rc::Rc;

    let loader = Rc::new(MapModuleLoader::default());
    let mut context = Context::builder()
        .module_loader(loader.clone())
        .build()
        .unwrap();

    let module = vec![(
        js_string!("doTheThrow"),
        IntoJsFunctionCopied::into_js_function_copied(
            |message: JsValue| -> JsResult<()> { Err(JsError::from_opaque(message)) },
            &mut context,
        ),
    )]
    .into_js_module(&mut context);

    loader.insert("test", module);

    let source = Source::from_bytes(
        r"
            import * as test from 'test';
            try {
                test.doTheThrow('javascript');
            } catch(e) {
                throw 'from ' + e;
            }
        ",
    );
    let root_module = Module::parse(source, None, &mut context).unwrap();

    let promise_result = root_module.load_link_evaluate(&mut context);
    context.run_jobs().unwrap();

    // Checking if the final promise didn't return an error.
    assert_eq!(
        promise_result.state().as_rejected(),
        Some(&js_string!("from javascript").into())
    );
}

#[test]
fn test_module_request_attribute_sorting() {
    let request1 = ModuleRequest::new(
        js_string!("specifier"),
        Box::new([
            ImportAttribute::new(js_string!("key2"), js_string!("val2")),
            ImportAttribute::new(js_string!("key1"), js_string!("val1")),
        ]),
    );

    let request2 = ModuleRequest::new(
        js_string!("specifier"),
        Box::new([
            ImportAttribute::new(js_string!("key1"), js_string!("val1")),
            ImportAttribute::new(js_string!("key2"), js_string!("val2")),
        ]),
    );

    assert_eq!(request1, request2);
    assert_eq!(request1.attributes()[0].key(), &js_string!("key1"));
    assert_eq!(request1.attributes()[1].key(), &js_string!("key2"));
}
