//! Boa's implementation of ECMAScript's global `eval` function.
//!
//! The `eval()` function evaluates ECMAScript code represented as a string.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!  - [MDN documentation][mdn]
//!
//! [spec]: https://tc39.es/ecma262/#sec-eval-x
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval

use crate::{
    Context, JsArgs, JsExpect, JsResult, JsString, JsValue, SpannedSourceText,
    builtins::{BuiltInObject, function::OrdinaryFunction},
    bytecompiler::{ByteCompiler, prepare_eval_declaration_instantiation},
    context::intrinsics::Intrinsics,
    environments::SavedEnvironments,
    error::JsNativeError,
    js_string,
    object::JsObject,
    realm::Realm,
    spanned_source_text::SourceText,
    string::StaticJsStrings,
    vm::{CallFrame, CallFrameFlags, source_info::SourcePath},
};
use boa_ast::{
    operations::{ContainsSymbol, contains, contains_arguments},
    scope::Scope,
};
use boa_gc::Gc;
use boa_parser::{Parser, Source};

use super::{BuiltInBuilder, IntrinsicObject};

#[derive(Debug, Clone, Copy)]
pub(crate) struct Eval;

impl IntrinsicObject for Eval {
    fn init(realm: &Realm) {
        BuiltInBuilder::callable_with_intrinsic::<Self>(realm, Self::eval)
            .name(Self::NAME)
            .length(1)
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        intrinsics.objects().eval().into()
    }
}

impl BuiltInObject for Eval {
    const NAME: JsString = StaticJsStrings::EVAL;
}

impl Eval {
    /// `19.2.1 eval ( x )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-eval-x
    fn eval(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Return ? PerformEval(x, false, false).
        Self::perform_eval(args.get_or_undefined(0), false, None, false, context)
    }

    /// `19.2.1.1 PerformEval ( x, strictCaller, direct )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-performeval
    pub(crate) fn perform_eval(
        x: &JsValue,
        direct: bool,
        lexical_scope: Option<Scope>,
        mut strict: bool,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        bitflags::bitflags! {
            /// Flags used to throw early errors on invalid `eval` calls.
            #[derive(Default)]
            struct Flags: u8 {
                const IN_FUNCTION = 0b0001;
                const IN_METHOD = 0b0010;
                const IN_DERIVED_CONSTRUCTOR = 0b0100;
                const IN_CLASS_FIELD_INITIALIZER = 0b1000;
            }
        }

        /// Possible actions that can be executed after exiting this function to restore the environment to its
        /// original state.
        enum EnvStackAction {
            Truncate(usize),
            Restore(SavedEnvironments),
        }

        // 1. Assert: If direct is false, then strictCaller is also false.
        debug_assert!(direct || !strict);

        // 2. If Type(x) is not String, return x.
        // TODO: rework parser to take an iterator of `u32` unicode codepoints
        let Some(x) = x.as_string() else {
            return Ok(x.clone());
        };

        // Because of implementation details the following code differs from the spec.

        // 3. Let evalRealm be the current Realm Record.
        // 4. NOTE: In the case of a direct eval, evalRealm is the realm of both the caller of eval
        // and of the eval function itself.
        let eval_realm = context.realm().clone();

        // 5. Perform ? HostEnsureCanCompileStrings(evalRealm, « », x, direct).
        context
            .host_hooks()
            .ensure_can_compile_strings(eval_realm, &[], &x, direct, context)?;

        // 11. Perform the following substeps in an implementation-defined order, possibly interleaving parsing and error detection:
        //     a. Let script be ParseText(StringToCodePoints(x), Script).
        //     b. If script is a List of errors, throw a SyntaxError exception.
        //     c. If script Contains ScriptBody is false, return undefined.
        //     d. Let body be the ScriptBody of script.
        let x = x.to_vec();
        let source = Source::from_utf16(&x);

        let mut parser = Parser::new(source);
        parser.set_identifier(context.next_parser_identifier());
        if strict {
            parser.set_strict();
        }
        let (mut body, source) = parser.parse_eval(direct, context.interner_mut())?;

        // 6. Let inFunction be false.
        // 7. Let inMethod be false.
        // 8. Let inDerivedConstructor be false.
        // 9. Let inClassFieldInitializer be false.
        // a. Let thisEnvRec be GetThisEnvironment().
        let flags = match {
            let frame = context.vm.frame();
            frame
                .environments
                .get_this_environment(frame.realm.environment())
        }
        .as_function()
        {
            // 10. If direct is true, then
            //     b. If thisEnvRec is a Function Environment Record, then
            Some(function_env) if direct => {
                // i. Let F be thisEnvRec.[[FunctionObject]].
                let function_object = function_env
                    .slots()
                    .function_object()
                    .downcast_ref::<OrdinaryFunction>()
                    .js_expect("must be function object")?;

                // ii. Set inFunction to true.
                let mut flags = Flags::IN_FUNCTION;

                // iii. Set inMethod to thisEnvRec.HasSuperBinding().
                if function_env.has_super_binding() {
                    flags |= Flags::IN_METHOD;
                }

                // iv. If F.[[ConstructorKind]] is derived, set inDerivedConstructor to true.
                if function_object.is_derived_constructor() {
                    flags |= Flags::IN_DERIVED_CONSTRUCTOR;
                }

                // v. Let classFieldInitializerName be F.[[ClassFieldInitializerName]].
                // vi. If classFieldInitializerName is not empty, set inClassFieldInitializer to true.
                if function_object.in_class_field_initializer() {
                    flags |= Flags::IN_CLASS_FIELD_INITIALIZER;
                }

                flags
            }
            _ => Flags::default(),
        };

        if !flags.contains(Flags::IN_FUNCTION) && contains(&body, ContainsSymbol::NewTarget) {
            return Err(JsNativeError::syntax()
                .with_message("invalid `new.target` expression inside eval")
                .into());
        }
        if !flags.contains(Flags::IN_METHOD) && contains(&body, ContainsSymbol::SuperProperty) {
            return Err(JsNativeError::syntax()
                .with_message("invalid `super` reference inside eval")
                .into());
        }
        if !flags.contains(Flags::IN_DERIVED_CONSTRUCTOR)
            && contains(&body, ContainsSymbol::SuperCall)
        {
            return Err(JsNativeError::syntax()
                .with_message("invalid `super` call inside eval")
                .into());
        }
        if flags.contains(Flags::IN_CLASS_FIELD_INITIALIZER) && contains_arguments(&body) {
            return Err(JsNativeError::syntax()
                .with_message("invalid `arguments` reference inside eval")
                .into());
        }

        strict |= body.strict();

        // Because our environment model does not map directly to the spec, this section looks very different.
        // 12 - 13 are implicit in the call of `Context::compile_with_new_declarative`.
        // 14 - 33 are in the following section, together with EvalDeclarationInstantiation.
        let action = if direct {
            // If the call to eval is direct, the code is executed in the current environment.

            // Poison the last parent function environment, because it may contain new declarations after/during eval.
            if !strict {
                {
                    let frame = context.vm.frame_mut();
                    let global = frame.realm.environment();
                    frame.environments.poison_until_last_function(global);
                }
            }

            // Set the compile time environment to the current running environment and save the number of current environments.
            let environments_len = context.vm.frame().environments.len();

            // Pop any added runtime environments that were not removed during the eval execution.
            EnvStackAction::Truncate(environments_len)
        } else {
            // If the call to eval is indirect, the code is executed in the global environment.

            // Pop all environments before the eval execution.
            let saved = context.vm.frame_mut().environments.pop_to_global();

            // Restore all environments to the state from before the eval execution.
            EnvStackAction::Restore(saved)
        };

        let context = &mut context.guard(move |ctx| match action {
            EnvStackAction::Truncate(len) => ctx.vm.frame_mut().environments.truncate(len),
            EnvStackAction::Restore(saved) => {
                ctx.vm.frame_mut().environments.truncate(0);
                ctx.vm.frame_mut().environments.restore_from_saved(saved);
            }
        });

        let (var_environment, mut variable_scope) =
            if let Some(e) = context.vm.frame().environments.outer_function_environment() {
                (e.0, e.1)
            } else {
                (
                    context.realm().environment().clone(),
                    context.realm().scope().clone(),
                )
            };

        let lexical_scope = lexical_scope.unwrap_or(context.realm().scope().clone());
        let lexical_scope = Scope::new(lexical_scope, strict);

        let mut annex_b_function_names = Vec::new();

        prepare_eval_declaration_instantiation(
            &mut annex_b_function_names,
            &body,
            strict,
            if strict {
                &lexical_scope
            } else {
                &variable_scope
            },
            &lexical_scope,
            context,
        )?;

        let in_with = context.vm.frame().environments.has_object_environment();

        let source_text = SourceText::new(source);
        let spanned_source_text = SpannedSourceText::new_source_only(source_text);

        let mut compiler = ByteCompiler::new(
            js_string!("<eval>"),
            body.strict(),
            false,
            variable_scope.clone(),
            lexical_scope.clone(),
            false,
            false,
            context.interner_mut(),
            in_with,
            spanned_source_text,
            // TODO: Could give more information from previous shadow stack.
            SourcePath::Eval,
        );

        // Increments the number of open environments to
        // account for the environment scope pushed to
        // the context at the end of `perform_eval`.
        compiler.current_open_environments_count += 1;

        if strict {
            variable_scope = lexical_scope.clone();
            compiler.variable_scope = lexical_scope.clone();
        }

        #[cfg(feature = "annex-b")]
        {
            compiler
                .annex_b_function_names
                .clone_from(&annex_b_function_names);
        }

        let bindings = body
            .analyze_scope_eval(
                strict,
                &variable_scope,
                &lexical_scope,
                &annex_b_function_names,
                compiler.interner(),
            )
            .map_err(|e| JsNativeError::syntax().with_message(e))?;

        compiler.eval_declaration_instantiation(&body, strict, &variable_scope, bindings);

        compiler.compile_statement_list(body.statements(), true, false);

        let code_block = Gc::new(compiler.finish());

        // Strict calls don't need extensions, since all strict eval calls push a new
        // function environment before evaluating.
        if !strict {
            var_environment.extend_from_compile();
        }

        let env_fp = context.vm.frame().environments.len() as u32;
        let environments = context.vm.frame().environments.clone();
        let realm = context.realm().clone();
        context.vm.push_frame_with_stack(
            CallFrame::new(code_block.clone(), None, environments, realm)
                .with_env_fp(env_fp)
                .with_flags(CallFrameFlags::EXIT_EARLY),
            JsValue::undefined(),
            JsValue::null(),
        );

        context.realm().resize_global_env();

        // Pushing the scope here ensures any function objects created
        // in `eval_declaration_instantiation` get their proper
        // environment stack.
        {
            let frame = context.vm.frame_mut();
            let global = frame.realm.environment();
            frame
                .environments
                .push_lexical(lexical_scope.num_bindings_non_local(), global);
        }

        context
            .eval_declaration_instantiation(&code_block)
            .inspect_err(|_| {
                context.vm.pop_frame();
            })?;

        let record = context.run();
        context.vm.pop_frame();

        record.consume()
    }
}
