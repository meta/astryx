use std::{cell::RefCell, mem::MaybeUninit};

use boa_string::JsString;
use dynify::Dynify;

use super::{IndexOperand, RegisterOperand};
use crate::{
    Context, JsError, JsExpect, JsObject, JsResult, JsValue, NativeFunction,
    builtins::{Promise, promise::PromiseCapability},
    error::JsNativeError,
    job::NativeAsyncJob,
    module::{ImportAttribute, ModuleKind, ModuleRequest, Referrer},
    object::FunctionObjectBuilder,
    vm::opcode::Operation,
};

/// `CallEval` implements the Opcode Operation for `Opcode::CallEval`
///
/// Operation:
///  - Call a function named "eval".
#[derive(Debug, Clone, Copy)]
pub(crate) struct CallEval;

impl CallEval {
    #[inline(always)]
    pub(super) fn operation(
        (argument_count, scope_index): (IndexOperand, IndexOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let func = context
            .vm
            .stack
            .calling_convention_get_function(argument_count.into());

        let Some(object) = func.as_object() else {
            return Err(crate::v8_messages::not_callable(context, &func).into());
        };

        // Taken from `13.3.6.1 Runtime Semantics: Evaluation`
        //            `CallExpression : CoverCallExpressionAndAsyncArrowHead`
        //
        // <https://tc39.es/ecma262/#sec-function-calls-runtime-semantics-evaluation>
        //
        // 6. If ref is a Reference Record, IsPropertyReference(ref) is false, and ref.[[ReferencedName]] is "eval", then
        //     a. If SameValue(func, %eval%) is true, then
        let eval = context.intrinsics().objects().eval();
        if JsObject::equals(&object, &eval) {
            let arguments = context
                .vm
                .stack
                .calling_convention_pop_arguments(argument_count.into());
            let _func = context.vm.stack.pop();
            let _this = context.vm.stack.pop();
            if let Some(x) = arguments.first() {
                // i. Let argList be ? ArgumentListEvaluation of arguments.
                // ii. If argList has no elements, return undefined.
                // iii. Let evalArg be the first element of argList.
                // iv. If the source text matched by this CallExpression is strict mode code,
                //     let strictCaller be true. Otherwise let strictCaller be false.
                // v. Return ? PerformEval(evalArg, strictCaller, true).
                let strict = context.vm.frame().code_block.strict();
                let scope = context
                    .vm
                    .frame()
                    .code_block()
                    .constant_scope(scope_index.into());
                let result = crate::builtins::eval::Eval::perform_eval(
                    x,
                    true,
                    Some(scope),
                    strict,
                    context,
                )?;
                context.vm.stack.push(result);
            } else {
                // NOTE: This is a deviation from the spec, to optimize the case when we dont pass anything to `eval`.
                context.vm.stack.push(JsValue::undefined());
            }

            return Ok(());
        }

        object.__call__(argument_count.into()).resolve(context)?;
        Ok(())
    }
}

impl Operation for CallEval {
    const NAME: &'static str = "CallEval";
    const INSTRUCTION: &'static str = "INST - CallEval";
    const COST: u8 = 5;
}

/// `CallEvalSpread` implements the Opcode Operation for `Opcode::CallEvalSpread`
///
/// Operation:
///  - Call a function named "eval" where the arguments contain spreads.
#[derive(Debug, Clone, Copy)]
pub(crate) struct CallEvalSpread;

impl CallEvalSpread {
    #[inline(always)]
    pub(super) fn operation(index: IndexOperand, context: &mut Context) -> JsResult<()> {
        // Get the arguments that are stored as an array object on the stack.
        let arguments_array = context.vm.stack.pop();
        let arguments_array_object = arguments_array
            .as_object()
            .js_expect("arguments array in call spread function must be an object")?;
        let arguments = arguments_array_object
            .borrow()
            .properties()
            .to_dense_indexed_properties()
            .js_expect("arguments array in call spread function must be dense")?;

        let func = context.vm.stack.calling_convention_get_function(0);

        let Some(object) = func.as_object() else {
            return Err(crate::v8_messages::not_callable(context, &func).into());
        };
        // Taken from `13.3.6.1 Runtime Semantics: Evaluation`
        //            `CallExpression : CoverCallExpressionAndAsyncArrowHead`
        //
        // <https://tc39.es/ecma262/#sec-function-calls-runtime-semantics-evaluation>
        //
        // 6. If ref is a Reference Record, IsPropertyReference(ref) is false, and ref.[[ReferencedName]] is "eval", then
        //     a. If SameValue(func, %eval%) is true, then
        let eval = context.intrinsics().objects().eval();
        if JsObject::equals(&object, &eval) {
            let _func = context.vm.stack.pop();
            let _this = context.vm.stack.pop();
            if let Some(x) = arguments.first() {
                // i. Let argList be ? ArgumentListEvaluation of arguments.
                // ii. If argList has no elements, return undefined.
                // iii. Let evalArg be the first element of argList.
                // iv. If the source text matched by this CallExpression is strict mode code,
                //     let strictCaller be true. Otherwise let strictCaller be false.
                // v. Return ? PerformEval(evalArg, strictCaller, true).
                let strict = context.vm.frame().code_block.strict();
                let scope = context.vm.frame().code_block().constant_scope(index.into());
                let result = crate::builtins::eval::Eval::perform_eval(
                    x,
                    true,
                    Some(scope),
                    strict,
                    context,
                )?;
                context.vm.stack.push(result);
            } else {
                // NOTE: This is a deviation from the spec, to optimize the case when we dont pass anything to `eval`.
                context.vm.stack.push(JsValue::undefined());
            }

            return Ok(());
        }

        let argument_count = arguments.len();
        context
            .vm
            .stack
            .calling_convention_push_arguments(&arguments);

        object.__call__(argument_count).resolve(context)?;
        Ok(())
    }
}

impl Operation for CallEvalSpread {
    const NAME: &'static str = "CallEvalSpread";
    const INSTRUCTION: &'static str = "INST - CallEvalSpread";
    const COST: u8 = 5;
}

/// `Call` implements the Opcode Operation for `Opcode::Call`
///
/// Operation:
///  - Call a function
#[derive(Debug, Clone, Copy)]
pub(crate) struct Call;

impl Call {
    #[inline(always)]
    pub(super) fn operation(argument_count: IndexOperand, context: &mut Context) -> JsResult<()> {
        let func = context
            .vm
            .stack
            .calling_convention_get_function(argument_count.into());

        let Some(object) = func.as_object().filter(JsObject::is_callable) else {
            return Err(Self::handle_not_callable(context, &func));
        };

        object.__call__(argument_count.into()).resolve(context)?;

        Ok(())
    }

    #[cold]
    #[inline(never)]
    fn handle_not_callable(context: &Context, func: &JsValue) -> JsError {
        crate::v8_messages::not_callable(context, func).into()
    }
}

impl Operation for Call {
    const NAME: &'static str = "Call";
    const INSTRUCTION: &'static str = "INST - Call";
    const COST: u8 = 3;
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct CallSpread;

impl CallSpread {
    #[inline(always)]
    pub(super) fn operation((): (), context: &mut Context) -> JsResult<()> {
        // Get the arguments that are stored as an array object on the stack.
        let arguments_array = context.vm.stack.pop();
        let arguments_array_object = arguments_array
            .as_object()
            .js_expect("arguments array in call spread function must be an object")?;
        let arguments = arguments_array_object
            .borrow()
            .properties()
            .to_dense_indexed_properties()
            .js_expect("arguments array in call spread function must be dense")?;

        let argument_count = arguments.len();
        context
            .vm
            .stack
            .calling_convention_push_arguments(&arguments);

        let func = context
            .vm
            .stack
            .calling_convention_get_function(argument_count);

        let Some(object) = func.as_object().filter(JsObject::is_callable) else {
            return Err(crate::v8_messages::not_callable(context, &func).into());
        };

        object.__call__(argument_count).resolve(context)?;
        Ok(())
    }
}

impl Operation for CallSpread {
    const NAME: &'static str = "CallSpread";
    const INSTRUCTION: &'static str = "INST - CallSpread";
    const COST: u8 = 3;
}

/// Parses the import attributes from the options object.
fn parse_import_attributes(
    specifier: JsString,
    options: &JsValue,
    context: &mut Context,
) -> JsResult<ModuleRequest> {
    // Taken from `EvaluateImportCall`
    //
    // <https://tc39.es/ecma262/#sec-evaluate-import-call>

    // 1. Let attributes be a new empty List.
    let mut attributes = Vec::new();

    // 2. If options is not undefined, then
    if !options.is_undefined() {
        // a. If Type(options) is not Object, throw a TypeError exception.
        let Some(options_obj) = options.as_object() else {
            return Err(JsNativeError::typ()
                .with_message("import options must be an object or undefined")
                .into());
        };

        // b. Let attributesObj be ? Get(options, "with").
        let attributes_obj = options_obj.get(crate::js_str!("with"), context)?;

        // c. If attributesObj is not undefined, then
        if !attributes_obj.is_undefined() {
            // i. If Type(attributesObj) is not Object, throw a TypeError exception.
            let Some(attributes_obj) = attributes_obj.as_object() else {
                return Err(JsNativeError::typ()
                    .with_message("the 'with' option must be an object")
                    .into());
            };

            // ii. Let entries be ? EnumerableOwnProperties(attributesObj, "key+value").
            let entries = attributes_obj.enumerable_own_property_names(
                crate::property::PropertyNameKind::KeyAndValue,
                context,
            )?;

            // iii. For each entry in entries, do
            attributes.reserve(entries.len());
            for entry in entries {
                let entry = entry
                    .as_object()
                    .js_expect("entry from EnumerableOwnProperties must be an object")?;

                // 1. Let key be entry.[[Key]].
                let key = entry.get(0, context)?;
                let key_str = key
                    .as_string()
                    .js_expect("key from EnumerableOwnProperties must be a string")?
                    .clone();

                // 2. Let value be entry.[[Value]].
                let value = entry.get(1, context)?;

                // 3. If Type(value) is not String, throw a TypeError exception.
                let Some(value_str) = value.as_string() else {
                    return Err(JsNativeError::typ()
                        .with_message("import attribute value must be a string")
                        .into());
                };
                let value_str = value_str.clone();

                // 4. Append the Record { [[Key]]: key, [[Value]]: value } to attributes.
                attributes.push(ImportAttribute::new(key_str, value_str));
            }
        }
    }

    // 3. Return the Record { [[Specifier]]: specifier, [[Attributes]]: attributes }.
    Ok(ModuleRequest::new(specifier, attributes.into_boxed_slice()))
}

/// Loads the module of a dynamic import. This combines the operations:
/// - [`HostLoadImportedModule(referrer, specifierString, empty, promiseCapability).`][load]
/// - [`FinishLoadingImportedModule ( referrer, specifier, payload, result )`][finish]
/// - [`ContinueDynamicImport ( promiseCapability, moduleCompletion )`][continue]
///
/// [load]: https://tc39.es/ecma262/#sec-HostLoadImportedModule
/// [finish]: https://tc39.es/ecma262/#sec-FinishLoadingImportedModule
/// [continue]: https://tc39.es/ecma262/#sec-ContinueDynamicImport
async fn load_dyn_import(
    referrer: Referrer,
    request: ModuleRequest,
    cap: PromiseCapability,
    phase: u32,
    context: &RefCell<&mut Context>,
) -> JsResult<()> {
    let loader = context.borrow().module_loader();
    let fut = loader.load_imported_module(referrer.clone(), request.clone(), context);
    let mut stack = [MaybeUninit::<u8>::uninit(); 16];
    let mut heap = Vec::<MaybeUninit<u8>>::new();
    let completion = fut.init2(&mut stack, &mut heap).await;

    // `ContinueDynamicImport ( promiseCapability, moduleCompletion )`
    // https://tc39.es/ecma262/#sec-ContinueDynamicImport

    // `FinishLoadingImportedModule ( referrer, specifier, payload, result )`
    // https://tc39.es/ecma262/#sec-FinishLoadingImportedModule

    let module = match completion {
        // 1. If moduleCompletion is an abrupt completion, then
        Err(err) => {
            // a. Perform ! Call(promiseCapability.[[Reject]], undefined, « moduleCompletion.[[Value]] »).
            let err = err.into_opaque(&mut context.borrow_mut())?;
            cap.reject()
                .call(&JsValue::undefined(), &[err], &mut context.borrow_mut())
                .expect("default `reject` function cannot throw");

            // b. Return unused.
            return Ok(());
        }
        Ok(m) => m,
    };

    // 1. If result is a normal completion, then
    match referrer {
        Referrer::Module(mod_ref) => {
            let ModuleKind::SourceText(src) = mod_ref.kind() else {
                panic!("referrer cannot be a synthetic module");
            };

            let mut loaded_modules = src.loaded_modules().borrow_mut();

            //     a. If referrer.[[LoadedModules]] contains a Record whose [[Specifier]] is specifier, then
            //     b. Else,
            //         i. Append the Record { [[Specifier]]: specifier, [[Module]]: result.[[Value]] } to referrer.[[LoadedModules]].
            let entry = loaded_modules
                .entry(request)
                .or_insert_with(|| module.clone());

            //         i. Assert: That Record's [[Module]] is result.[[Value]].
            debug_assert_eq!(&module, entry);

            // Same steps apply to referrers below
        }
        Referrer::Realm(realm) => {
            let mut loaded_modules = realm.loaded_modules().borrow_mut();
            let entry = loaded_modules
                .entry(request.specifier().clone())
                .or_insert_with(|| module.clone());
            debug_assert_eq!(&module, entry);
        }
        Referrer::Script(script) => {
            let mut loaded_modules = script.loaded_modules().borrow_mut();
            let entry = loaded_modules
                .entry(request.specifier().clone())
                .or_insert_with(|| module.clone());
            debug_assert_eq!(&module, entry);
        }
    }

    // When the `experimental` feature is disabled, reject any non-evaluation phase.
    #[cfg(not(feature = "experimental"))]
    if phase != 0 {
        let err = JsNativeError::syntax()
            .with_message("import.defer() and import.source() require the 'experimental' feature")
            .into();
        let err = JsError::into_opaque(err, &mut context.borrow_mut())?;
        cap.reject()
            .call(&JsValue::undefined(), &[err], &mut context.borrow_mut())
            .expect("default `reject` function cannot throw");
        return Ok(());
    }

    // TODO: For source phase (phase == 2), implement GetModuleSource()
    // 16.2.1.7.2 GetModuleSource ( )
    // Source Text Module Record provides a GetModuleSource implementation
    // that always returns an abrupt completion indicating that a source phase import is not available.
    // 1. Throw a SyntaxError exception.
    #[cfg(feature = "experimental")]
    if phase == 2 {
        let err = JsNativeError::syntax()
            .with_message("source phase import is not available for this module")
            .into();
        let err = JsError::into_opaque(err, &mut context.borrow_mut())?;
        cap.reject()
            .call(&JsValue::undefined(), &[err], &mut context.borrow_mut())
            .expect("default `reject` function cannot throw");
        return Ok(());
    }

    // 2. Let module be moduleCompletion.[[Value]].
    // 3. Let loadPromise be module.LoadRequestedModules().
    let load = module.load(&mut context.borrow_mut());

    // 4. Let rejectedClosure be a new Abstract Closure with parameters (reason) that captures promiseCapability and performs the following steps when called:
    // 5. Let onRejected be CreateBuiltinFunction(rejectedClosure, 1, "", « »).
    let on_rejected = FunctionObjectBuilder::new(
        context.borrow().realm(),
        NativeFunction::from_copy_closure_with_captures(
            |_, args, cap, context| {
                //     a. Perform ! Call(promiseCapability.[[Reject]], undefined, « reason »).
                cap.reject()
                    .call(&JsValue::undefined(), args, context)
                    .expect("default `reject` function cannot throw");

                //     b. Return unused.
                Ok(JsValue::undefined())
            },
            cap.clone(),
        ),
    )
    .build();

    // 6. Let linkAndEvaluateClosure be a new Abstract Closure with no parameters that captures module, promiseCapability, and onRejected and performs the following steps when called:
    // 7. Let linkAndEvaluate be CreateBuiltinFunction(linkAndEvaluateClosure, 0, "", « »).
    let link_evaluate = FunctionObjectBuilder::new(
        context.borrow().realm(),
        NativeFunction::from_copy_closure_with_captures(
            |_, _, (module, cap, on_rejected), context| {
                // a. Let link be Completion(module.Link()).
                // b. If link is an abrupt completion, then
                if let Err(e) = module.link(context) {
                    // i. Perform ! Call(promiseCapability.[[Reject]], undefined, « link.[[Value]] »).
                    let e = e.into_opaque(context)?;
                    cap.reject()
                        .call(&JsValue::undefined(), &[e], context)
                        .expect("default `reject` function cannot throw");
                    // ii. Return unused.
                    return Ok(JsValue::undefined());
                }

                // c. Let evaluatePromise be module.Evaluate().
                let evaluate = module.evaluate(context)?;

                // d. Let fulfilledClosure be a new Abstract Closure with no parameters that captures module and promiseCapability and performs the following steps when called:
                // e. Let onFulfilled be CreateBuiltinFunction(fulfilledClosure, 0, "", « »).
                let fulfill = FunctionObjectBuilder::new(
                    context.realm(),
                    NativeFunction::from_copy_closure_with_captures(
                        |_, _, (module, cap), context| {
                            // i. Let namespace be GetModuleNamespace(module).
                            let namespace = module.namespace(context);

                            // ii. Perform ! Call(promiseCapability.[[Resolve]], undefined, « namespace »).
                            cap.resolve()
                                .call(&JsValue::undefined(), &[namespace.into()], context)
                                .expect("default `resolve` function cannot throw");

                            // iii. Return unused.
                            Ok(JsValue::undefined())
                        },
                        (module.clone(), cap.clone()),
                    ),
                )
                .build();

                // f. Perform PerformPromiseThen(evaluatePromise, onFulfilled, onRejected).
                Promise::perform_promise_then(
                    &evaluate,
                    Some(fulfill),
                    Some(on_rejected.clone()),
                    None,
                    context,
                );

                // g. Return unused.
                Ok(JsValue::undefined())
            },
            (module.clone(), cap.clone(), on_rejected.clone()),
        ),
    )
    .build();

    // 8. Perform PerformPromiseThen(loadPromise, linkAndEvaluate, onRejected).
    Promise::perform_promise_then(
        &load,
        Some(link_evaluate),
        Some(on_rejected),
        None,
        &mut context.borrow_mut(),
    );

    // 9. Return unused.
    Ok(())
}

/// `ImportCall` implements the Opcode Operation for `Opcode::ImportCall`
///
/// Operation:
///  - Dynamically imports a module
#[derive(Debug, Clone, Copy)]
pub(crate) struct ImportCall;

impl ImportCall {
    #[inline(always)]
    pub(super) fn operation(
        (specifier_op, options_op, phase_op): (RegisterOperand, RegisterOperand, IndexOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        // Import Calls
        // Runtime Semantics: Evaluation
        // https://tc39.es/ecma262/#sec-import-call-runtime-semantics-evaluation

        let phase: u32 = phase_op.into();

        // 1. Let referrer be GetActiveScriptOrModule().
        // 2. If referrer is null, set referrer to the current Realm Record.
        let referrer = context
            .get_active_script_or_module()
            .map_or_else(|| Referrer::Realm(context.realm().clone()), Into::into);

        // 3. Let argRef be ? Evaluation of AssignmentExpression.
        // 4. Let specifier be ? GetValue(argRef).
        let specifier = context.vm.get_register(specifier_op.into()).clone();

        // Get options if provided
        let options = context.vm.get_register(options_op.into()).clone();

        // 5. Let promiseCapability be ! NewPromiseCapability(%Promise%).
        let cap = PromiseCapability::new(
            &context.intrinsics().constructors().promise().constructor(),
            context,
        )
        .expect("operation cannot fail for the %Promise% intrinsic");
        let promise = cap.promise().clone();

        // 6. Let specifierString be Completion(ToString(specifier)).
        let specifier_str = match specifier.to_string(context) {
            Ok(s) => s,
            // 7. IfAbruptRejectPromise(specifierString, promiseCapability).
            Err(err) => {
                let err = err.into_opaque(context)?;
                cap.reject().call(&JsValue::undefined(), &[err], context)?;
                context.vm.set_register(specifier_op.into(), promise.into());
                return Ok(());
            }
        };

        let request = match parse_import_attributes(specifier_str, &options, context) {
            Ok(req) => req,
            Err(err) => {
                let err = err.into_opaque(context)?;
                cap.reject().call(&JsValue::undefined(), &[err], context)?;
                context.vm.set_register(specifier_op.into(), promise.into());
                return Ok(());
            }
        };

        // 8. Perform HostLoadImportedModule(referrer, specifierString, empty, promiseCapability).
        let job = NativeAsyncJob::with_realm(
            async move |context| {
                load_dyn_import(referrer, request, cap, phase, context).await?;
                Ok(JsValue::undefined())
            },
            context.realm().clone(),
        );
        context.enqueue_job(job.into());

        // 9. Return promiseCapability.[[Promise]].
        context.vm.set_register(specifier_op.into(), promise.into());

        Ok(())
    }
}

impl Operation for ImportCall {
    const NAME: &'static str = "ImportCall";
    const INSTRUCTION: &'static str = "INST - ImportCall";
    const COST: u8 = 15;
}
