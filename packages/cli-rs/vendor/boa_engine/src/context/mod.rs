//! The ECMAScript context.

use std::any::Any;
use std::{cell::Cell, path::Path, rc::Rc};

use boa_ast::StatementList;
use boa_interner::Interner;
use boa_parser::source::ReadChar;
pub use hooks::{DefaultHooks, HostHooks};
#[cfg(feature = "intl")]
pub use icu::IcuError;
use intrinsics::Intrinsics;
#[cfg(any(feature = "temporal", feature = "intl"))]
use temporal_rs::provider::TimeZoneProvider;
#[cfg(any(feature = "temporal", feature = "intl"))]
use timezone_provider::experimental_tzif::ZeroCompiledTzdbProvider;

use crate::job::Job;
use crate::js_error;
use crate::module::DynModuleLoader;
use crate::vm::{CodeBlock, RuntimeLimits, create_function_object_fast};
use crate::{
    HostDefined, JsNativeError, JsResult, JsString, JsValue, Source, builtins,
    class::{Class, ClassBuilder},
    job::{JobExecutor, SimpleJobExecutor},
    js_string,
    module::{IdleModuleLoader, ModuleLoader, SimpleModuleLoader},
    native_function::NativeFunction,
    object::{FunctionObjectBuilder, JsObject, shape::RootShape},
    optimizer::{Optimizer, OptimizerOptions, OptimizerStatistics},
    property::{Attribute, PropertyDescriptor, PropertyKey},
    realm::Realm,
    script::Script,
    vm::{ActiveRunnable, CallFrame, Vm},
};

use self::intrinsics::StandardConstructor;

pub mod time;
use crate::context::time::StdClock;
pub use time::Clock;

mod hooks;
#[cfg(feature = "intl")]
pub(crate) mod icu;
pub mod intrinsics;

thread_local! {
    static CANNOT_BLOCK_COUNTER: Cell<u64> = const { Cell::new(0) };
}

/// ECMAScript context. It is the primary way to interact with the runtime.
///
/// `Context`s constructed in a thread share the same runtime, therefore it
/// is possible to share objects from one context to another context, but they
/// have to be in the same thread.
///
/// # Examples
///
/// ## Execute Function of Script File
///
/// ```rust
/// use boa_engine::{
///     Context, Source, js_string,
///     object::ObjectInitializer,
///     property::{Attribute, PropertyDescriptor},
/// };
///
/// let script = r#"
///     function test(arg1) {
///         if(arg1 != null) {
///             return arg1.x;
///         }
///         return 112233;
///     }
/// "#;
///
/// let mut context = Context::default();
///
/// // Populate the script definition to the context.
/// context.eval(Source::from_bytes(script)).unwrap();
///
/// // Create an object that can be used in eval calls.
/// let arg = ObjectInitializer::new(&mut context)
///     .property(js_string!("x"), 12, Attribute::READONLY)
///     .build();
/// context
///     .register_global_property(js_string!("arg"), arg, Attribute::all())
///     .expect("property shouldn't exist");
///
/// let value = context.eval(Source::from_bytes("test(arg)")).unwrap();
///
/// assert_eq!(value.as_number(), Some(12.0))
/// ```
pub struct Context {
    /// String interner in the context.
    interner: Interner,

    /// Execute in strict mode,
    strict: bool,

    /// Number of instructions remaining before a forced exit
    #[cfg(feature = "fuzz")]
    pub(crate) instructions_remaining: usize,

    pub(crate) vm: Vm,

    pub(crate) kept_alive: Vec<JsObject>,

    can_block: bool,

    #[cfg(any(feature = "temporal", feature = "intl"))]
    timezone_provider: Box<dyn TimeZoneProvider>,

    /// Intl data provider.
    #[cfg(feature = "intl")]
    intl_provider: icu::IntlProvider,

    host_hooks: Rc<dyn HostHooks>,

    clock: Rc<dyn Clock>,

    job_executor: Rc<dyn JobExecutor>,

    module_loader: Rc<dyn DynModuleLoader>,

    optimizer_options: OptimizerOptions,
    root_shape: RootShape,

    /// Unique identifier for each parser instance used during the context lifetime.
    parser_identifier: u32,

    data: HostDefined<dyn Any>,
}

impl std::fmt::Debug for Context {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut debug = f.debug_struct("Context");

        debug
            .field("realm", &self.vm.frame().realm)
            .field("interner", &self.interner)
            .field("vm", &self.vm)
            .field("strict", &self.strict)
            .field("job_executor", &"JobExecutor")
            .field("hooks", &"HostHooks")
            .field("clock", &"Clock")
            .field("module_loader", &"ModuleLoader")
            .field("optimizer_options", &self.optimizer_options);

        #[cfg(feature = "intl")]
        debug.field("intl_provider", &self.intl_provider);

        // TODO: Support TimeZoneProvider debug names
        #[cfg(feature = "temporal")]
        debug.field("timezone_provider", &"TimeZoneProvider");

        debug.finish_non_exhaustive()
    }
}

impl Drop for Context {
    fn drop(&mut self) {
        if !self.can_block {
            CANNOT_BLOCK_COUNTER.set(CANNOT_BLOCK_COUNTER.get() - 1);
        }
    }
}

impl Default for Context {
    fn default() -> Self {
        ContextBuilder::default()
            .build()
            .expect("Building the default context should not fail")
    }
}

// ==== Public API ====
impl Context {
    /// Create a new [`ContextBuilder`] to specify the [`Interner`] and/or
    /// the icu data provider.
    #[must_use]
    pub fn builder() -> ContextBuilder {
        ContextBuilder::default()
    }

    /// Evaluates the given source by compiling down to bytecode, then interpreting the
    /// bytecode into a value.
    ///
    /// # Examples
    /// ```
    /// # use boa_engine::{Context, Source};
    /// let mut context = Context::default();
    ///
    /// let source = Source::from_bytes("1 + 3");
    /// let value = context.eval(source).unwrap();
    ///
    /// assert!(value.is_number());
    /// assert_eq!(value.as_number().unwrap(), 4.0);
    /// ```
    ///
    /// Note that this won't run any scheduled promise jobs; you need to call [`Context::run_jobs`]
    /// on the context or [`JobExecutor::run_jobs`] on the provided queue to run them.
    #[allow(clippy::unit_arg, dropping_copy_types)]
    pub fn eval<R: ReadChar>(&mut self, src: Source<'_, R>) -> JsResult<JsValue> {
        Script::parse(src, None, self)?.evaluate(self)
    }

    /// Applies optimizations to the [`StatementList`] inplace.
    pub fn optimize_statement_list(
        &mut self,
        statement_list: &mut StatementList,
    ) -> OptimizerStatistics {
        let mut optimizer = Optimizer::new(self);
        optimizer.apply(statement_list)
    }

    /// Register a global property.
    ///
    /// It will return an error if the property is already defined.
    ///
    /// # Example
    /// ```
    /// use boa_engine::{
    ///     Context, js_string,
    ///     object::ObjectInitializer,
    ///     property::{Attribute, PropertyDescriptor},
    /// };
    ///
    /// let mut context = Context::default();
    ///
    /// context
    ///     .register_global_property(
    ///         js_string!("myPrimitiveProperty"),
    ///         10,
    ///         Attribute::all(),
    ///     )
    ///     .expect("property shouldn't exist");
    ///
    /// let object = ObjectInitializer::new(&mut context)
    ///     .property(js_string!("x"), 0, Attribute::all())
    ///     .property(js_string!("y"), 1, Attribute::all())
    ///     .build();
    /// context
    ///     .register_global_property(
    ///         js_string!("myObjectProperty"),
    ///         object,
    ///         Attribute::all(),
    ///     )
    ///     .expect("property shouldn't exist");
    /// ```
    pub fn register_global_property<K, V>(
        &mut self,
        key: K,
        value: V,
        attribute: Attribute,
    ) -> JsResult<()>
    where
        K: Into<PropertyKey>,
        V: Into<JsValue>,
    {
        self.global_object().define_property_or_throw(
            key,
            PropertyDescriptor::builder()
                .value(value)
                .writable(attribute.writable())
                .enumerable(attribute.enumerable())
                .configurable(attribute.configurable()),
            self,
        )?;
        Ok(())
    }

    /// Register a global native callable.
    ///
    /// The function will be both `constructable` (call with `new <name>()`) and `callable` (call
    /// with `<name>()`).
    ///
    /// The function will be bound to the global object with `writable`, `non-enumerable`
    /// and `configurable` attributes. The same as when you create a function in JavaScript.
    ///
    /// # Note
    ///
    /// If you wish to only create the function object without binding it to the global object, you
    /// can use the [`FunctionObjectBuilder`] API.
    pub fn register_global_callable(
        &mut self,
        name: JsString,
        length: usize,
        body: NativeFunction,
    ) -> JsResult<()> {
        let function = FunctionObjectBuilder::new(self.realm(), body)
            .name(name.clone())
            .length(length)
            .constructor(true)
            .build();

        self.global_object().define_property_or_throw(
            name,
            PropertyDescriptor::builder()
                .value(function)
                .writable(true)
                .enumerable(false)
                .configurable(true),
            self,
        )?;
        Ok(())
    }

    /// Register a global native function that is not a constructor.
    ///
    /// The function will be bound to the global object with `writable`, `non-enumerable`
    /// and `configurable` attributes. The same as when you create a function in JavaScript.
    ///
    /// # Note
    ///
    /// The difference to [`Context::register_global_callable`] is, that the function will not be
    /// `constructable`. Usage of the function as a constructor will produce a `TypeError`.
    pub fn register_global_builtin_callable(
        &mut self,
        name: JsString,
        length: usize,
        body: NativeFunction,
    ) -> JsResult<()> {
        let function = FunctionObjectBuilder::new(self.realm(), body)
            .name(name.clone())
            .length(length)
            .constructor(false)
            .build();

        self.global_object().define_property_or_throw(
            name,
            PropertyDescriptor::builder()
                .value(function)
                .writable(true)
                .enumerable(false)
                .configurable(true),
            self,
        )?;
        Ok(())
    }

    /// Registers a global class `C` in the currently active realm.
    ///
    /// Errors if the class has already been registered.
    ///
    /// # Example
    /// ```ignore
    /// #[derive(Debug, Trace, Finalize)]
    /// struct MyClass;
    ///
    /// impl Class for MyClass {
    ///    // ...
    /// }
    ///
    /// context.register_global_class::<MyClass>()?;
    /// ```
    pub fn register_global_class<C: Class>(&mut self) -> JsResult<()> {
        if self.realm().has_class::<C>() {
            return Err(JsNativeError::typ()
                .with_message("cannot register a class twice")
                .into());
        }

        let mut class_builder = ClassBuilder::new::<C>(self);
        C::init(&mut class_builder)?;

        let class = class_builder.build();
        let property = PropertyDescriptor::builder()
            .value(class.constructor())
            .writable(C::ATTRIBUTES.writable())
            .enumerable(C::ATTRIBUTES.enumerable())
            .configurable(C::ATTRIBUTES.configurable());

        self.global_object()
            .define_property_or_throw(js_string!(C::NAME), property, self)?;
        self.realm().register_class::<C>(class);

        Ok(())
    }

    /// Removes the global class `C` from the currently active realm, returning the constructor
    /// and prototype of the class if `C` was registered.
    ///
    /// # Note
    ///
    /// This makes the constructor return an error on further calls, but note that this won't protect
    /// static properties from being accessed within variables that stored the constructor before being
    /// unregistered.  If you need that functionality, you can use a static accessor that first checks
    /// if the class is registered ([`Context::has_global_class`]) before returning the static value.
    ///
    /// # Example
    /// ```ignore
    /// #[derive(Debug, Trace, Finalize)]
    /// struct MyClass;
    ///
    /// impl Class for MyClass {
    ///    // ...
    /// }
    ///
    /// context.register_global_class::<MyClass>()?;
    /// // ... code
    /// context.unregister_global_class::<MyClass>()?;
    /// ```
    pub fn unregister_global_class<C: Class>(&mut self) -> JsResult<Option<StandardConstructor>> {
        self.global_object()
            .delete_property_or_throw(js_string!(C::NAME), self)?;
        Ok(self.realm().unregister_class::<C>())
    }

    /// Checks if the currently active realm has the global class `C` registered.
    #[must_use]
    pub fn has_global_class<C: Class>(&self) -> bool {
        self.realm().has_class::<C>()
    }

    /// Gets the constructor and prototype of the global class `C` if the currently active realm has
    /// that class registered.
    #[must_use]
    pub fn get_global_class<C: Class>(&self) -> Option<StandardConstructor> {
        self.realm().get_class::<C>()
    }

    /// Gets the string interner.
    #[inline]
    #[must_use]
    pub const fn interner(&self) -> &Interner {
        &self.interner
    }

    /// Gets a mutable reference to the string interner.
    #[inline]
    pub fn interner_mut(&mut self) -> &mut Interner {
        &mut self.interner
    }

    /// Returns the global object.
    #[inline]
    #[must_use]
    pub fn global_object(&self) -> JsObject {
        self.vm.frame().realm.global_object().clone()
    }

    /// Returns the currently active intrinsic constructors and objects.
    #[inline]
    #[must_use]
    pub fn intrinsics(&self) -> &Intrinsics {
        self.vm.frame().realm.intrinsics()
    }

    /// Returns the amount of remaining instructions to be executed
    #[cfg(feature = "fuzz")]
    #[inline]
    #[must_use]
    pub fn instructions_remaining(&self) -> usize {
        self.instructions_remaining
    }

    /// Returns the currently active realm.
    #[inline]
    #[must_use]
    pub fn realm(&self) -> &Realm {
        &self.vm.frame().realm
    }

    /// Set the value of trace on the context
    #[cfg(feature = "trace")]
    #[inline]
    pub fn set_trace(&mut self, trace: bool) {
        self.vm.trace = trace;
    }

    /// Get optimizer options.
    #[inline]
    #[must_use]
    pub const fn optimizer_options(&self) -> OptimizerOptions {
        self.optimizer_options
    }
    /// Enable or disable optimizations
    #[inline]
    pub fn set_optimizer_options(&mut self, optimizer_options: OptimizerOptions) {
        self.optimizer_options = optimizer_options;
    }

    /// Changes the strictness mode of the context.
    #[inline]
    pub fn strict(&mut self, strict: bool) {
        self.strict = strict;
    }

    /// Enqueues a [`Job`] on the [`JobExecutor`].
    #[inline]
    pub fn enqueue_job(&mut self, job: Job) {
        self.job_executor().enqueue_job(job, self);
    }

    /// Runs all the jobs with the provided job executor.
    #[inline]
    pub fn run_jobs(&mut self) -> JsResult<()> {
        self.job_executor().run_jobs(self)
    }

    /// Abstract operation [`ClearKeptObjects`][clear].
    ///
    /// Clears all objects maintained alive by calls to the [`AddToKeptObjects`][add] abstract
    /// operation, used within the [`WeakRef`][weak] constructor.
    ///
    /// [clear]: https://tc39.es/ecma262/multipage/executable-code-and-execution-contexts.html#sec-clear-kept-objects
    /// [add]: https://tc39.es/ecma262/multipage/executable-code-and-execution-contexts.html#sec-addtokeptobjects
    /// [weak]: https://tc39.es/ecma262/multipage/managing-memory.html#sec-weak-ref-objects
    #[inline]
    pub fn clear_kept_objects(&mut self) {
        self.kept_alive.clear();
    }

    /// Retrieves the current stack trace of the context.
    ///
    /// The stack trace is returned ordered with the most recent frames first.
    #[inline]
    pub fn stack_trace(&self) -> impl Iterator<Item = &CallFrame> {
        // The first frame is always a dummy frame (see `Vm` implementation for more details),
        // so skip the dummy frame and return the reversed list so that the most recent frames are first.
        self.vm.frames.iter().skip(1).rev()
    }

    /// Replaces the currently active realm with `realm`, and returns the old realm.
    #[inline]
    pub fn enter_realm(&mut self, realm: Realm) -> Realm {
        std::mem::replace(&mut self.vm.frame_mut().realm, realm)
    }

    /// Create a new Realm with the default global bindings.
    pub fn create_realm(&mut self) -> JsResult<Realm> {
        let realm = Realm::create(self.host_hooks.as_ref(), &self.root_shape)?;

        let old_realm = self.enter_realm(realm);

        builtins::set_default_global_bindings(self)?;

        Ok(self.enter_realm(old_realm))
    }

    /// Get the [`RootShape`].
    #[inline]
    #[must_use]
    pub const fn root_shape(&self) -> &RootShape {
        &self.root_shape
    }

    /// Gets the host hooks.
    #[inline]
    #[must_use]
    pub fn host_hooks(&self) -> Rc<dyn HostHooks> {
        self.host_hooks.clone()
    }

    /// Gets the internal clock.
    #[inline]
    #[must_use]
    pub fn clock(&self) -> &dyn Clock {
        self.clock.as_ref()
    }

    /// Gets the current job executor, or `None` if the current job executor
    /// is not a `T`.
    #[inline]
    #[must_use]
    pub fn downcast_job_executor<T: 'static>(&self) -> Option<Rc<T>> {
        Rc::downcast(self.job_executor.clone()).ok()
    }

    /// Gets the current module loader, or `None` if the current module loader
    /// is not a `T`.
    #[must_use]
    pub fn downcast_module_loader<T: 'static>(&self) -> Option<Rc<T>> {
        Rc::downcast(self.module_loader.clone()).ok()
    }

    /// Get the [`RuntimeLimits`].
    #[inline]
    #[must_use]
    pub const fn runtime_limits(&self) -> RuntimeLimits {
        self.vm.runtime_limits
    }

    /// Set the [`RuntimeLimits`].
    #[inline]
    pub fn set_runtime_limits(&mut self, runtime_limits: RuntimeLimits) {
        self.vm.runtime_limits = runtime_limits;
    }

    /// Get a mutable reference to the [`RuntimeLimits`].
    #[inline]
    pub fn runtime_limits_mut(&mut self) -> &mut RuntimeLimits {
        &mut self.vm.runtime_limits
    }

    /// Returns `true` if this context can be suspended by an `Atomics.wait` call.
    #[inline]
    #[must_use]
    pub fn can_block(&self) -> bool {
        self.can_block
    }

    /// Gets a mutable reference to the inner [`HostDefined`] field.
    #[inline]
    pub fn host_defined_mut(&mut self) -> &mut HostDefined<dyn Any> {
        &mut self.data
    }

    /// Insert a type into the context-specific [`HostDefined`] field.
    #[inline]
    pub fn insert_data<T: Any>(&mut self, value: T) -> Option<Box<T>> {
        self.data.insert(value)
    }

    /// Check if the context-specific [`HostDefined`] has type T.
    #[inline]
    #[must_use]
    pub fn has_data<T: Any>(&self) -> bool {
        self.data.has::<T>()
    }

    /// Remove type T from the context-specific [`HostDefined`], if it exists.
    #[inline]
    pub fn remove_data<T: Any>(&mut self) -> Option<Box<T>> {
        self.data.remove::<T>()
    }

    /// Get type T from the context-specific [`HostDefined`], if it exists.
    #[inline]
    #[must_use]
    pub fn get_data<T: Any>(&self) -> Option<&T> {
        self.data.get::<T>()
    }
}

// ==== Private API ====

impl Context {
    /// Gets the current job executor.
    pub(crate) fn job_executor(&self) -> Rc<dyn JobExecutor> {
        self.job_executor.clone()
    }

    /// Gets the current module loader.
    pub(crate) fn module_loader(&self) -> Rc<dyn DynModuleLoader> {
        self.module_loader.clone()
    }

    /// Swaps the currently active realm with `realm`.
    pub(crate) fn swap_realm(&mut self, realm: &mut Realm) {
        std::mem::swap(&mut self.vm.frame_mut().realm, realm);
    }

    /// Increment and get the parser identifier.
    pub(crate) fn next_parser_identifier(&mut self) -> u32 {
        self.parser_identifier += 1;
        self.parser_identifier
    }

    /// `CanDeclareGlobalFunction ( N )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-candeclareglobalfunction
    pub(crate) fn can_declare_global_function(&mut self, name: &JsString) -> JsResult<bool> {
        // 1. Let ObjRec be envRec.[[ObjectRecord]].
        // 2. Let globalObject be ObjRec.[[BindingObject]].
        let global_object = self.realm().global_object().clone();

        // 3. Let existingProp be ? globalObject.[[GetOwnProperty]](N).
        let name = name.clone().into();
        let existing_prop = global_object.__get_own_property__(&name, &mut self.into())?;

        // 4. If existingProp is undefined, return ? IsExtensible(globalObject).
        let Some(existing_prop) = existing_prop else {
            return global_object.is_extensible(self);
        };

        // 5. If existingProp.[[Configurable]] is true, return true.
        if existing_prop.configurable() == Some(true) {
            return Ok(true);
        }

        // 6. If IsDataDescriptor(existingProp) is true and existingProp has attribute values { [[Writable]]: true, [[Enumerable]]: true }, return true.
        if existing_prop.is_data_descriptor()
            && existing_prop.writable() == Some(true)
            && existing_prop.enumerable() == Some(true)
        {
            return Ok(true);
        }

        // 7. Return false.
        Ok(false)
    }

    /// `CanDeclareGlobalVar ( N )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-candeclareglobalvar
    pub(crate) fn can_declare_global_var(&mut self, name: &JsString) -> JsResult<bool> {
        // 1. Let ObjRec be envRec.[[ObjectRecord]].
        // 2. Let globalObject be ObjRec.[[BindingObject]].
        let global_object = self.realm().global_object().clone();

        // 3. Let hasProperty be ? HasOwnProperty(globalObject, N).
        let has_property = global_object.has_own_property(name.clone(), self)?;

        // 4. If hasProperty is true, return true.
        if has_property {
            return Ok(true);
        }

        // 5. Return ? IsExtensible(globalObject).
        global_object.is_extensible(self)
    }

    /// `CreateGlobalVarBinding ( N, D )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-createglobalvarbinding
    pub(crate) fn create_global_var_binding(
        &mut self,
        name: JsString,
        configurable: bool,
    ) -> JsResult<()> {
        // 1. Let ObjRec be envRec.[[ObjectRecord]].
        // 2. Let globalObject be ObjRec.[[BindingObject]].
        let global_object = self.realm().global_object().clone();

        // 3. Let hasProperty be ? HasOwnProperty(globalObject, N).
        let has_property = global_object.has_own_property(name.clone(), self)?;

        // 4. Let extensible be ? IsExtensible(globalObject).
        let extensible = global_object.is_extensible(self)?;

        // 5. If hasProperty is false and extensible is true, then
        if !has_property && extensible {
            // a. Perform ? ObjRec.CreateMutableBinding(N, D).
            // b. Perform ? ObjRec.InitializeBinding(N, undefined).
            global_object.define_property_or_throw(
                name,
                PropertyDescriptor::builder()
                    .value(JsValue::undefined())
                    .writable(true)
                    .enumerable(true)
                    .configurable(configurable)
                    .build(),
                self,
            )?;
        }

        // 6. If envRec.[[VarNames]] does not contain N, then
        //     a. Append N to envRec.[[VarNames]].
        // 7. Return unused.
        Ok(())
    }

    /// `CreateGlobalFunctionBinding ( N, V, D )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-createglobalfunctionbinding
    pub(crate) fn create_global_function_binding(
        &mut self,
        name: JsString,
        function: JsObject,
        configurable: bool,
    ) -> JsResult<()> {
        // 1. Let ObjRec be envRec.[[ObjectRecord]].
        // 2. Let globalObject be ObjRec.[[BindingObject]].
        let global_object = self.realm().global_object().clone();

        // 3. Let existingProp be ? globalObject.[[GetOwnProperty]](N).
        let existing_prop =
            global_object.__get_own_property__(&name.clone().into(), &mut self.into())?;

        // 4. If existingProp is undefined or existingProp.[[Configurable]] is true, then
        let desc = if existing_prop.is_none()
            || existing_prop.and_then(|p| p.configurable()) == Some(true)
        {
            // a. Let desc be the PropertyDescriptor { [[Value]]: V, [[Writable]]: true, [[Enumerable]]: true, [[Configurable]]: D }.
            PropertyDescriptor::builder()
                .value(function.clone())
                .writable(true)
                .enumerable(true)
                .configurable(configurable)
                .build()
        }
        // 5. Else,
        else {
            // a. Let desc be the PropertyDescriptor { [[Value]]: V }.
            PropertyDescriptor::builder()
                .value(function.clone())
                .build()
        };

        // 6. Perform ? DefinePropertyOrThrow(globalObject, N, desc).
        global_object.define_property_or_throw(name.clone(), desc, self)?;

        // 7. Perform ? Set(globalObject, N, V, false).
        global_object.set(name, function, false, self)?;

        // 8. If envRec.[[VarNames]] does not contain N, then
        //     a. Append N to envRec.[[VarNames]].
        // 9. Return unused.
        Ok(())
    }

    /// `HasRestrictedGlobalProperty ( N )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-hasrestrictedglobalproperty
    pub(crate) fn has_restricted_global_property(&mut self, name: &JsString) -> JsResult<bool> {
        // 1. Let ObjRec be envRec.[[ObjectRecord]].
        // 2. Let globalObject be ObjRec.[[BindingObject]].
        let global_object = self.realm().global_object().clone();

        // 3. Let existingProp be ? globalObject.[[GetOwnProperty]](N).
        let name = name.clone().into();
        let existing_prop = global_object.__get_own_property__(&name, &mut self.into())?;

        // 4. If existingProp is undefined, return false.
        let Some(existing_prop) = existing_prop else {
            return Ok(false);
        };

        // 5. If existingProp.[[Configurable]] is true, return false.
        if existing_prop.configurable() == Some(true) {
            return Ok(false);
        }

        // 6. Return true.
        Ok(true)
    }

    /// Returns `true` if this context is in strict mode.
    pub(crate) const fn is_strict(&self) -> bool {
        self.strict
    }

    /// `9.4.1 GetActiveScriptOrModule ( )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-getactivescriptormodule
    #[must_use]
    pub fn get_active_script_or_module(&self) -> Option<ActiveRunnable> {
        // 1. If the execution context stack is empty, return null.
        // 2. Let ec be the topmost execution context on the execution context stack whose ScriptOrModule component is not null.
        // 3. If no such execution context exists, return null. Otherwise, return ec's ScriptOrModule.
        if let Some(active_runnable) = &self.vm.frame().active_runnable {
            return Some(active_runnable.clone());
        }

        self.vm
            .frames
            .iter()
            .rev()
            .find_map(|frame| frame.active_runnable.clone())
    }

    /// Get `active function object`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#active-function-object
    pub(crate) fn active_function_object(&self) -> Option<JsObject> {
        if self.vm.native_active_function.is_some() {
            return self.vm.native_active_function.clone();
        }

        self.vm.stack.get_function(self.vm.frame())
    }

    /// Creates all globals required to evaluate `codeblock`.
    ///
    /// This is the common path of the instantiations:
    /// - `EvalDeclarationInstantiation ( body, varEnv, lexEnv, privateEnv, strict )`
    /// - `GlobalDeclarationInstantiation ( script, env )`
    fn create_globals(
        &mut self,
        codeblock: &CodeBlock,
        configurable_globals: bool,
    ) -> JsResult<()> {
        // 8. For each element d of varDeclarations, in reverse List order, do
        //    a. If d is not either a VariableDeclaration, a ForBinding, or a BindingIdentifier, then
        //       i. Assert: d is either a FunctionDeclaration, a GeneratorDeclaration, an AsyncFunctionDeclaration, or an AsyncGeneratorDeclaration.
        //       ii. NOTE: If there are multiple function declarations for the same name, the last declaration is used.
        //       iii. Let fn be the sole element of the BoundNames of d.
        for fun in codeblock.global_fns.iter().rev() {
            // ...
            // 1. Let fnDefinable be ? env.CanDeclareGlobalFunction(fn).
            // 2. If fnDefinable is false, throw a TypeError exception.
            let name = codeblock.constant_string(fun.name_index as usize);
            if !self.can_declare_global_function(&name)? {
                return Err(js_error!(TypeError: "cannot declare global function"));
            }
        }

        // 10. For each element d of varDeclarations, do
        for global_var in &codeblock.global_vars {
            // ...
            // a. Let vnDefinable be ? env.CanDeclareGlobalVar(vn).
            // b. If vnDefinable is false, throw a TypeError exception.
            let name = codeblock.constant_string(*global_var as usize);
            if !self.can_declare_global_var(&name)? {
                return Err(js_error!(TypeError: "cannot declare global variable"));
            }
        }

        // 16. For each Parse Node f of functionsToInitialize, do
        for fun in &codeblock.global_fns {
            // ...
            // c. Perform ? env.CreateGlobalFunctionBinding(fn, fo, false).
            let function = create_function_object_fast(
                codeblock.constant_function(fun.function_index as usize),
                self,
            );
            let name = codeblock.constant_string(fun.name_index as usize);
            self.create_global_function_binding(name, function, configurable_globals)?;
        }

        // 17. For each String vn of declaredVarNames, do
        for global_declared_var in &codeblock.global_vars {
            // a. Perform ? env.CreateGlobalVarBinding(vn, false).
            let name = codeblock.constant_string(*global_declared_var as usize);
            self.create_global_var_binding(name, configurable_globals)?;
        }

        Ok(())
    }

    /// `GlobalDeclarationInstantiation ( script, env )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-globaldeclarationinstantiation
    pub(crate) fn global_declaration_instantiation(
        &mut self,
        codeblock: &CodeBlock,
    ) -> JsResult<()> {
        // 3. For each element name of lexNames, do
        for global_lex in &codeblock.global_lexs {
            // c. Let hasRestrictedGlobal be ? env.HasRestrictedGlobalProperty(name).
            // d. If hasRestrictedGlobal is true, throw a SyntaxError exception.
            let name = codeblock.constant_string(*global_lex as usize);
            if self.has_restricted_global_property(&name)? {
                return Err(
                    js_error!(SyntaxError: "cannot redefine non-configurable global property"),
                );
            }
        }

        self.create_globals(codeblock, false)
    }

    /// `EvalDeclarationInstantiation ( body, varEnv, lexEnv, privateEnv, strict )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-evaldeclarationinstantiation
    pub(crate) fn eval_declaration_instantiation(&mut self, codeblock: &CodeBlock) -> JsResult<()> {
        self.create_globals(codeblock, true)
    }
}

impl Context {
    /// Creates a `ContextCleanupGuard` that executes some cleanup after being dropped.
    pub(crate) fn guard<F>(&mut self, cleanup: F) -> ContextCleanupGuard<'_, F>
    where
        F: FnOnce(&mut Context) + 'static,
    {
        ContextCleanupGuard::new(self, cleanup)
    }

    /// Get the Intl data provider.
    #[cfg(feature = "intl")]
    pub(crate) const fn intl_provider(&self) -> &icu::IntlProvider {
        &self.intl_provider
    }

    /// Get the Time Zone Provider
    #[cfg(feature = "temporal")]
    pub(crate) fn timezone_provider(&self) -> &dyn TimeZoneProvider {
        self.timezone_provider.as_ref()
    }
}

/// Builder for the [`Context`] type.
///
/// This builder allows custom initialization of the [`Interner`] within
/// the context.
#[derive(Default)]
pub struct ContextBuilder {
    interner: Option<Interner>,
    host_hooks: Option<Rc<dyn HostHooks>>,
    clock: Option<Rc<dyn Clock>>,
    job_executor: Option<Rc<dyn JobExecutor>>,
    module_loader: Option<Rc<dyn DynModuleLoader>>,
    can_block: bool,
    #[cfg(feature = "intl")]
    icu: Option<icu::IntlProvider>,
    #[cfg(feature = "temporal")]
    timezone_provider: Option<Box<dyn TimeZoneProvider>>,
    #[cfg(feature = "fuzz")]
    instructions_remaining: usize,
}

impl std::fmt::Debug for ContextBuilder {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        #[derive(Clone, Copy, Debug)]
        struct JobExecutor;
        #[derive(Clone, Copy, Debug)]
        struct HostHooks;
        #[derive(Clone, Copy, Debug)]
        struct Clock;
        #[derive(Clone, Copy, Debug)]
        struct ModuleLoader;

        let mut out = f.debug_struct("ContextBuilder");

        out.field("interner", &self.interner)
            .field("host_hooks", &self.host_hooks.as_ref().map(|_| HostHooks))
            .field("clock", &self.clock.as_ref().map(|_| Clock))
            .field(
                "job_executor",
                &self.job_executor.as_ref().map(|_| JobExecutor),
            )
            .field(
                "module_loader",
                &self.module_loader.as_ref().map(|_| ModuleLoader),
            )
            .field("can_block", &self.can_block);

        #[cfg(feature = "intl")]
        out.field("icu", &self.icu);

        #[cfg(feature = "temporal")]
        out.field(
            "timezone_provider",
            &self.timezone_provider.as_ref().map(|_| "TimeZoneProvider"),
        );

        #[cfg(feature = "fuzz")]
        out.field("instructions_remaining", &self.instructions_remaining);

        out.finish()
    }
}

impl ContextBuilder {
    /// Creates a new [`ContextBuilder`] with a default empty [`Interner`]
    /// and a default `BoaProvider` if the `intl` feature is enabled.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Initializes the context [`Interner`] to the provided interner.
    ///
    /// This is useful when you want to initialize an [`Interner`] with
    /// a collection of words before parsing.
    #[must_use]
    #[allow(clippy::missing_const_for_fn)]
    pub fn interner(mut self, interner: Interner) -> Self {
        self.interner = Some(interner);
        self
    }

    /// Provides a [`BufferProvider`] data provider to the [`Context`].
    ///
    /// This function is only available if the `intl` feature is enabled.
    ///
    /// # Additional considerations
    ///
    /// If the data was generated using `icu_datagen`, make sure that the deduplication strategy is
    /// not set to [`Maximal`]. Otherwise, `icu_datagen` will delete base locales such as "en" from
    /// the list of supported locales if the required data for "en" is the same as "und".
    /// We recommend [`RetainBaseLanguages`] as a nice default, which will only deduplicate locales
    /// if the deduplication target is not "und".
    ///
    /// # Errors
    ///
    /// This returns `Err` if the provided provider doesn't have the required locale information
    /// to construct common tools used through `Intl`. Note that this doesn't
    /// mean that the provider will successfully construct all `Intl` services; that check is made
    /// until the creation of an instance of a service.
    ///
    /// [`Maximal`]: https://docs.rs/icu_datagen/latest/icu_datagen/enum.DeduplicationStrategy.html#variant.Maximal
    /// [`RetainBaseLanguages`]: https://docs.rs/icu_datagen/latest/icu_datagen/enum.DeduplicationStrategy.html#variant.RetainBaseLanguages
    /// [`BufferProvider`]: icu_provider::buf::BufferProvider
    #[cfg(feature = "intl")]
    pub fn icu_buffer_provider<
        T: icu_provider::prelude::DynamicDryDataProvider<icu_provider::prelude::BufferMarker>
            + 'static,
    >(
        mut self,
        provider: T,
    ) -> Result<Self, IcuError> {
        self.icu = Some(icu::IntlProvider::try_new_buffer(provider));
        Ok(self)
    }

    /// Set the [`timezone_provider::provider::TimeZoneProvider`] that should be used to source
    /// time zone data.
    ///
    /// ## Default
    ///
    /// If no time zone provider is provided, a compiled time zone provider will be used
    /// which includes the time zone data in the binary. This may increase binary sizes
    /// by up to 200 Kb.
    #[cfg(feature = "temporal")]
    #[must_use]
    pub fn timezone_provider<T: TimeZoneProvider + 'static>(mut self, provider: T) -> Self {
        self.timezone_provider = Some(Box::new(provider));
        self
    }

    /// Initializes the [`HostHooks`] for the context.
    ///
    /// [`Host Hooks`]: https://tc39.es/ecma262/#sec-host-hooks-summary
    #[must_use]
    pub fn host_hooks<H: HostHooks + 'static>(mut self, host_hooks: Rc<H>) -> Self {
        self.host_hooks = Some(host_hooks);
        self
    }

    /// Initializes the [`Clock`] for the context.
    #[must_use]
    pub fn clock<C: Clock + 'static>(mut self, clock: Rc<C>) -> Self {
        self.clock = Some(clock);
        self
    }

    /// Initializes the [`JobExecutor`] for the context.
    #[must_use]
    pub fn job_executor<Q: JobExecutor + 'static>(mut self, job_executor: Rc<Q>) -> Self {
        self.job_executor = Some(job_executor);
        self
    }

    /// Initializes the [`ModuleLoader`] for the context.
    #[must_use]
    pub fn module_loader<M: ModuleLoader + 'static>(mut self, module_loader: Rc<M>) -> Self {
        self.module_loader = Some(module_loader);
        self
    }

    /// [`AgentCanSuspend ( )`][spec] aka `[[CanBlock]]`
    ///
    /// Defines if this context can be suspended by calls to the [`Atomics.wait`][wait] function.
    ///
    /// # Note
    ///
    /// By the specification, multiple agents cannot share the same thread if any of them has its
    /// `[[CanBlock]]` field set to true. The builder will verify at build time that all contexts on
    /// the current thread fulfill this requisite.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-agentcansuspend
    /// [wait]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics/wait
    #[must_use]
    pub const fn can_block(mut self, can_block: bool) -> Self {
        self.can_block = can_block;
        self
    }

    /// Specifies the number of instructions remaining to the [`Context`].
    ///
    /// This function is only available if the `fuzz` feature is enabled.
    #[cfg(feature = "fuzz")]
    #[must_use]
    pub const fn instructions_remaining(mut self, instructions_remaining: usize) -> Self {
        self.instructions_remaining = instructions_remaining;
        self
    }

    /// Builds a new [`Context`] with the provided parameters, and defaults
    /// all missing parameters to their default values.
    // TODO: try to use a custom error here, since most of the `JsError` APIs
    // require having a `Context` in the first place.
    pub fn build(self) -> JsResult<Context> {
        if self.can_block {
            if CANNOT_BLOCK_COUNTER.get() > 0 {
                return Err(JsNativeError::typ()
                    .with_message(
                        "a context that can block must be the only active context in its current thread",
                    )
                    .into());
            }
        } else {
            CANNOT_BLOCK_COUNTER.set(CANNOT_BLOCK_COUNTER.get() + 1);
        }

        let root_shape = RootShape::default();

        let host_hooks = self.host_hooks.unwrap_or(Rc::new(DefaultHooks));
        let clock = self.clock.unwrap_or_else(|| Rc::new(StdClock::new()));
        let realm = Realm::create(host_hooks.as_ref(), &root_shape)?;
        let vm = Vm::new(realm);

        let module_loader: Rc<dyn DynModuleLoader> = if let Some(loader) = self.module_loader {
            loader
        } else if let Ok(loader) = SimpleModuleLoader::new(Path::new(".")) {
            Rc::new(loader)
        } else {
            Rc::new(IdleModuleLoader)
        };

        let job_executor = self
            .job_executor
            .unwrap_or_else(|| Rc::new(SimpleJobExecutor::new()));

        let mut context = Context {
            interner: self.interner.unwrap_or_default(),
            vm,
            strict: false,
            #[cfg(feature = "temporal")]
            timezone_provider: if let Some(provider) = self.timezone_provider {
                provider
            } else {
                Box::new(ZeroCompiledTzdbProvider::default())
            },
            #[cfg(feature = "intl")]
            intl_provider: if let Some(icu) = self.icu {
                icu
            } else {
                cfg_if::cfg_if! {
                    if #[cfg(feature = "intl_bundled")] {
                        icu::IntlProvider::try_new_buffer(boa_icu_provider::buffer())
                    } else {
                        return Err(JsNativeError::typ()
                            .with_message("missing Intl provider for context")
                            .into()
                        );
                    }
                }
            },
            #[cfg(feature = "fuzz")]
            instructions_remaining: self.instructions_remaining,
            kept_alive: Vec::new(),
            host_hooks,
            clock,
            job_executor,
            module_loader,
            optimizer_options: OptimizerOptions::OPTIMIZE_ALL,
            root_shape,
            parser_identifier: 0,
            can_block: self.can_block,
            data: HostDefined::default(),
        };

        builtins::set_default_global_bindings(&mut context)?;

        Ok(context)
    }
}

/// A cleanup guard for a [`Context`] that is executed when dropped.
#[derive(Debug)]
pub(crate) struct ContextCleanupGuard<'a, F>
where
    F: FnOnce(&mut Context) + 'static,
{
    context: &'a mut Context,
    cleanup: Option<F>,
}

impl<'a, F> ContextCleanupGuard<'a, F>
where
    F: FnOnce(&mut Context) + 'static,
{
    /// Creates a new `ContextCleanupGuard` from the current context and its cleanup operation.
    pub(crate) fn new(context: &'a mut Context, cleanup: F) -> Self {
        Self {
            context,
            cleanup: Some(cleanup),
        }
    }
}

impl<F> std::ops::Deref for ContextCleanupGuard<'_, F>
where
    F: FnOnce(&mut Context) + 'static,
{
    type Target = Context;

    fn deref(&self) -> &Self::Target {
        self.context
    }
}

impl<F> std::ops::DerefMut for ContextCleanupGuard<'_, F>
where
    F: FnOnce(&mut Context) + 'static,
{
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.context
    }
}

impl<F> Drop for ContextCleanupGuard<'_, F>
where
    F: FnOnce(&mut Context) + 'static,
{
    fn drop(&mut self) {
        if let Some(cleanup) = self.cleanup.take() {
            cleanup(self.context);
        }
    }
}
