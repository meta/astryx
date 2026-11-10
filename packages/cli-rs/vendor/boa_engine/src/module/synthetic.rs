use boa_ast::scope::Scope;
use boa_gc::{Finalize, Gc, GcRefCell, Trace};
use rustc_hash::FxHashSet;

use super::{BindingName, ResolveExportError, ResolvedBinding};
use crate::{
    Context, JsExpect, JsNativeError, JsResult, JsString, JsValue, Module, SpannedSourceText,
    builtins::promise::ResolvingFunctions,
    bytecompiler::ByteCompiler,
    class::{Class, ClassBuilder},
    environments::{DeclarativeEnvironment, EnvironmentStack},
    js_string,
    object::JsPromise,
    vm::{ActiveRunnable, CallFrame, CodeBlock, source_info::SourcePath},
};

trait TraceableCallback: Trace {
    fn call(&self, module: &SyntheticModule, context: &mut Context) -> JsResult<()>;
}

#[derive(Trace, Finalize)]
struct Callback<F, T>
where
    F: Fn(&SyntheticModule, &T, &mut Context) -> JsResult<()>,
    T: Trace,
{
    // SAFETY: `SyntheticModuleInitializer`'s safe API ensures only `Copy` closures are stored; its unsafe API,
    // on the other hand, explains the invariants to hold in order for this to be safe, shifting
    // the responsibility to the caller.
    #[unsafe_ignore_trace]
    f: F,
    captures: T,
}

impl<F, T> TraceableCallback for Callback<F, T>
where
    F: Fn(&SyntheticModule, &T, &mut Context) -> JsResult<()>,
    T: Trace,
{
    fn call(&self, module: &SyntheticModule, context: &mut Context) -> JsResult<()> {
        (self.f)(module, &self.captures, context)
    }
}

/// The initializing steps of a [`SyntheticModule`].
///
/// # Caveats
///
/// By limitations of the Rust language, the garbage collector currently cannot inspect closures
/// in order to trace their captured variables. This means that only [`Copy`] closures are 100% safe
/// to use. All other closures can also be stored in a `NativeFunction`, albeit by using an `unsafe`
/// API, but note that passing closures implicitly capturing traceable types could cause
/// **Undefined Behaviour**.
#[derive(Clone, Trace, Finalize)]
pub struct SyntheticModuleInitializer {
    inner: Gc<dyn TraceableCallback>,
}

impl std::fmt::Debug for SyntheticModuleInitializer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SyntheticModuleInitializer")
            .finish_non_exhaustive()
    }
}

impl SyntheticModuleInitializer {
    /// Creates a `SyntheticModuleInitializer` from a [`Copy`] closure.
    pub fn from_copy_closure<F>(closure: F) -> Self
    where
        F: Fn(&SyntheticModule, &mut Context) -> JsResult<()> + Copy + 'static,
    {
        // SAFETY: The `Copy` bound ensures there are no traceable types inside the closure.
        unsafe { Self::from_closure(closure) }
    }

    /// Creates a `SyntheticModuleInitializer` from a [`Copy`] closure and a list of traceable captures.
    pub fn from_copy_closure_with_captures<F, T>(closure: F, captures: T) -> Self
    where
        F: Fn(&SyntheticModule, &T, &mut Context) -> JsResult<()> + Copy + 'static,
        T: Trace + 'static,
    {
        // SAFETY: The `Copy` bound ensures there are no traceable types inside the closure.
        unsafe { Self::from_closure_with_captures(closure, captures) }
    }

    /// Creates a new `SyntheticModuleInitializer` from a closure.
    ///
    /// # Safety
    ///
    /// Passing a closure that contains a captured variable that needs to be traced by the garbage
    /// collector could cause an use after free, memory corruption or other kinds of **Undefined
    /// Behaviour**. See <https://github.com/Manishearth/rust-gc/issues/50> for a technical explanation
    /// on why that is the case.
    pub unsafe fn from_closure<F>(closure: F) -> Self
    where
        F: Fn(&SyntheticModule, &mut Context) -> JsResult<()> + 'static,
    {
        // SAFETY: The caller must ensure the invariants of the closure hold.
        unsafe {
            Self::from_closure_with_captures(
                move |module, (), context| closure(module, context),
                (),
            )
        }
    }

    /// Create a new `SyntheticModuleInitializer` from a closure and a list of traceable captures.
    ///
    /// # Safety
    ///
    /// Passing a closure that contains a captured variable that needs to be traced by the garbage
    /// collector could cause an use after free, memory corruption or other kinds of **Undefined
    /// Behaviour**. See <https://github.com/Manishearth/rust-gc/issues/50> for a technical explanation
    /// on why that is the case.
    pub unsafe fn from_closure_with_captures<F, T>(closure: F, captures: T) -> Self
    where
        F: Fn(&SyntheticModule, &T, &mut Context) -> JsResult<()> + 'static,
        T: Trace + 'static,
    {
        // Hopefully, this unsafe operation will be replaced by the `CoerceUnsized` API in the
        // future: https://github.com/rust-lang/rust/issues/18598
        let ptr = Gc::into_raw(Gc::new(Callback {
            f: closure,
            captures,
        }));

        // SAFETY: The pointer returned by `into_raw` is only used to coerce to a trait object,
        // meaning this is safe.
        unsafe {
            Self {
                inner: Gc::from_raw(ptr),
            }
        }
    }

    /// Calls this `SyntheticModuleInitializer`, forwarding the arguments to the corresponding function.
    #[inline]
    pub(crate) fn call(&self, module: &SyntheticModule, context: &mut Context) -> JsResult<()> {
        self.inner.call(module, context)
    }
}

/// Current status of a [`SyntheticModule`].
#[derive(Debug, Trace, Finalize, Default)]
#[boa_gc(unsafe_no_drop)]
enum ModuleStatus {
    #[default]
    Unlinked,
    Linked {
        environment: Gc<DeclarativeEnvironment>,
        eval_context: (EnvironmentStack, Gc<CodeBlock>),
    },
    Evaluated {
        environment: Gc<DeclarativeEnvironment>,
        promise: JsPromise,
    },
}

impl ModuleStatus {
    /// Transition from one state to another, taking the current state by value to move data
    /// between states.
    fn transition<F>(&mut self, f: F)
    where
        F: FnOnce(Self) -> Self,
    {
        *self = f(std::mem::take(self));
    }
}

/// ECMAScript's [**Synthetic Module Records**][spec].
///
/// [spec]: https://tc39.es/proposal-json-modules/#sec-synthetic-module-records
#[derive(Trace, Finalize)]
pub struct SyntheticModule {
    #[unsafe_ignore_trace]
    export_names: FxHashSet<JsString>,
    eval_steps: SyntheticModuleInitializer,
    state: GcRefCell<ModuleStatus>,
}

impl std::fmt::Debug for SyntheticModule {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SyntheticModule")
            .field("export_names", &self.export_names)
            .field("eval_steps", &self.eval_steps)
            .finish_non_exhaustive()
    }
}

impl SyntheticModule {
    /// Abstract operation [`SetSyntheticModuleExport ( module, exportName, exportValue )`][spec].
    ///
    /// Sets or changes the exported value for `exportName` in the synthetic module.
    ///
    /// # Note
    ///
    /// The default export corresponds to the name `"default"`, but note that it needs to
    /// be passed to the list of exported names in [`Module::synthetic`] beforehand.
    ///
    /// [spec]: https://tc39.es/proposal-json-modules/#sec-createsyntheticmodule
    pub fn set_export(&self, export_name: &JsString, export_value: JsValue) -> JsResult<()> {
        let env = self.environment().ok_or_else(|| {
            JsNativeError::typ().with_message(format!(
                "cannot set name `{}` in an unlinked synthetic module",
                export_name.to_std_string_escaped()
            ))
        })?;
        let locator = env
            .kind()
            .as_module()
            .js_expect("must be module environment")?
            .compile()
            .get_binding(export_name)
            .ok_or_else(|| {
                JsNativeError::reference().with_message(format!(
                    "cannot set name `{}` which was not included in the list of exports",
                    export_name.to_std_string_escaped()
                ))
            })?;
        env.set(locator.binding_index(), export_value);

        Ok(())
    }

    /// Sets or changes the exported value for `C::NAME` in the synthetic module
    /// to the Class's constructor.
    pub fn export_class<C: Class>(&self, context: &mut Context) -> JsResult<()> {
        self.export_named_class::<C>(&JsString::from(C::NAME), context)
    }

    /// Sets or changes the exported value for `export_name` in the synthetic module
    /// to the Class's constructor.
    pub fn export_named_class<C: Class>(
        &self,
        export_name: &JsString,
        context: &mut Context,
    ) -> JsResult<()> {
        let mut class_builder = ClassBuilder::new::<C>(context);
        C::init(&mut class_builder)?;

        let class = class_builder.build();

        self.set_export(export_name, class.constructor().into())?;
        Ok(())
    }

    /// Creates a new synthetic module.
    pub(super) fn new(names: FxHashSet<JsString>, eval_steps: SyntheticModuleInitializer) -> Self {
        Self {
            export_names: names,
            eval_steps,
            state: GcRefCell::default(),
        }
    }

    /// Concrete method [`LoadRequestedModules ( )`][spec].
    ///
    /// [spec]: https://tc39.es/proposal-json-modules/#sec-smr-LoadRequestedModules
    pub(super) fn load(context: &mut Context) -> JsPromise {
        JsPromise::resolve(JsValue::undefined(), context)
            .expect("default resolve functions cannot throw and must return a promise")
    }

    /// Concrete method [`GetExportedNames ( [ exportStarSet ] )`][spec].
    ///
    /// [spec]: https://tc39.es/proposal-json-modules/#sec-smr-getexportednames
    pub(super) fn get_exported_names(&self) -> FxHashSet<JsString> {
        // 1. Return module.[[ExportNames]].
        self.export_names.clone()
    }

    /// Concrete method [`ResolveExport ( exportName )`][spec]
    ///
    /// [spec]: https://tc39.es/proposal-json-modules/#sec-smr-resolveexport
    #[allow(clippy::mutable_key_type)]
    pub(super) fn resolve_export(
        &self,
        module_self: &Module,
        export_name: &JsString,
    ) -> Result<ResolvedBinding, ResolveExportError> {
        if self.export_names.contains(export_name) {
            // 2. Return ResolvedBinding Record { [[Module]]: module, [[BindingName]]: exportName }.
            Ok(ResolvedBinding {
                module: module_self.clone(),
                binding_name: BindingName::Name(export_name.clone()),
            })
        } else {
            // 1. If module.[[ExportNames]] does not contain exportName, return null.
            Err(ResolveExportError::NotFound)
        }
    }

    /// Concrete method [`Link ( )`][spec].
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-moduledeclarationlinking
    pub(super) fn link(&self, module_self: &Module, context: &mut Context) {
        if !matches!(&*self.state.borrow(), ModuleStatus::Unlinked) {
            // Already linked and/or evaluated.
            return;
        }

        // 1. Let realm be module.[[Realm]].
        // 2. Let env be NewModuleEnvironment(realm.[[GlobalEnv]]).
        // 3. Set module.[[Environment]] to env.
        let global_env = module_self.realm().environment().clone();
        let global_scope = module_self.realm().scope().clone();
        let module_scope = Scope::new(global_scope, true);

        // TODO: A bit of a hack to be able to pass the currently active runnable without an
        // available codeblock to execute.
        let compiler = ByteCompiler::new(
            js_string!("<synthetic>"),
            true,
            false,
            module_scope.clone(),
            module_scope.clone(),
            false,
            false,
            context.interner_mut(),
            false,
            // A synthetic module does not contain `SourceText`
            SpannedSourceText::new_empty(),
            SourcePath::None,
        );

        // 4. For each String exportName in module.[[ExportNames]], do
        let exports = self
            .export_names
            .iter()
            .map(|name| {
                //     a. Perform ! env.CreateMutableBinding(exportName, false).
                module_scope.create_mutable_binding(name.clone(), false)
            })
            .collect::<Vec<_>>();

        module_scope.escape_all_bindings();

        let cb = Gc::new(compiler.finish());

        let mut envs = EnvironmentStack::new();
        envs.push_module(module_scope);

        for locator in exports {
            //     b. Perform ! env.InitializeBinding(exportName, undefined).
            envs.put_lexical_value(
                locator.scope(),
                locator.binding_index(),
                JsValue::undefined(),
                &global_env,
            );
        }

        let env = envs
            .current_declarative_ref(&global_env)
            .cloned()
            .expect("should have the module environment");

        self.state
            .borrow_mut()
            .transition(|_| ModuleStatus::Linked {
                environment: env,
                eval_context: (envs, cb),
            });

        // 5. Return unused.
    }

    /// Concrete method [`Evaluate ( )`][spec].
    ///
    /// [spec]: https://tc39.es/proposal-json-modules/#sec-smr-Evaluate
    pub(super) fn evaluate(
        &self,
        module_self: &Module,
        context: &mut Context,
    ) -> JsResult<JsPromise> {
        let (environments, codeblock) = match &*self.state.borrow() {
            ModuleStatus::Unlinked => {
                let (promise, ResolvingFunctions { reject, .. }) = JsPromise::new_pending(context);
                reject
                    .call(
                        &JsValue::undefined(),
                        &[JsNativeError::typ()
                            .with_message("cannot evaluate unlinked synthetic module")
                            .into_opaque(context)
                            .into()],
                        context,
                    )
                    .js_expect("native resolving functions cannot throw")?;
                return Ok(promise);
            }
            ModuleStatus::Linked { eval_context, .. } => eval_context.clone(),
            ModuleStatus::Evaluated { promise, .. } => return Ok(promise.clone()),
        };
        // 1. Let moduleContext be a new ECMAScript code execution context.

        let realm = module_self.realm().clone();

        let env_fp = environments.len() as u32;
        let callframe = CallFrame::new(
            codeblock,
            // 4. Set the ScriptOrModule of moduleContext to module.
            Some(ActiveRunnable::Module(module_self.clone())),
            // 5. Set the VariableEnvironment of moduleContext to module.[[Environment]].
            // 6. Set the LexicalEnvironment of moduleContext to module.[[Environment]].
            environments,
            // 3. Set the Realm of moduleContext to module.[[Realm]].
            realm,
        )
        .with_env_fp(env_fp);

        // 2. Set the Function of moduleContext to null.
        // 7. Suspend the currently running execution context.
        // 8. Push moduleContext on to the execution context stack; moduleContext is now the running execution context.
        context
            .vm
            .push_frame_with_stack(callframe, JsValue::undefined(), JsValue::null());

        // 9. Let steps be module.[[EvaluationSteps]].
        // 10. Let result be Completion(steps(module)).
        let result = self.eval_steps.call(self, context);

        // 11. Suspend moduleContext and remove it from the execution context stack.
        // 12. Resume the context that is now on the top of the execution context stack as the running execution context.
        let frame = context
            .vm
            .pop_frame()
            .js_expect("there should be a frame")?;
        context.vm.stack.truncate_to_frame(&frame);

        // 13. Let pc be ! NewPromiseCapability(%Promise%).
        let (promise, ResolvingFunctions { resolve, reject }) = JsPromise::new_pending(context);

        match result {
            // 15. Perform ! pc.[[Resolve]](result).
            Ok(()) => resolve.call(&JsValue::undefined(), &[], context),
            // 14. IfAbruptRejectPromise(result, pc).
            Err(err) => reject.call(&JsValue::undefined(), &[err.into_opaque(context)?], context),
        }
        .js_expect("default resolving functions cannot throw")?;

        self.state.borrow_mut().transition(|state| match state {
            ModuleStatus::Linked { environment, .. } => ModuleStatus::Evaluated {
                environment,
                promise: promise.clone(),
            },
            _ => unreachable!("checks above ensure the module is linked"),
        });

        // 16. Return pc.[[Promise]].
        Ok(promise)
    }

    pub(crate) fn environment(&self) -> Option<Gc<DeclarativeEnvironment>> {
        match &*self.state.borrow() {
            ModuleStatus::Unlinked => None,
            ModuleStatus::Linked { environment, .. }
            | ModuleStatus::Evaluated { environment, .. } => Some(environment.clone()),
        }
    }
}
