use super::{BindingAccessOpcode, ToJsString};
use crate::{
    Context, JsNativeError, JsResult, SpannedSourceText,
    bytecompiler::{ByteCompiler, FunctionCompiler, FunctionSpec, NodeKind},
    vm::{CallFrame, GlobalFunctionBinding, opcode::BindingOpcode},
};
use boa_ast::{
    Script,
    declaration::Binding,
    function::{FormalParameterList, FunctionBody},
    operations::{
        LexicallyScopedDeclaration, VarScopedDeclaration, all_private_identifiers_valid,
        bound_names, lexically_declared_names, lexically_scoped_declarations, var_declared_names,
        var_scoped_declarations,
    },
    scope::{FunctionScopes, Scope},
    scope_analyzer::EvalDeclarationBindings,
    visitor::NodeRef,
};
use boa_interner::{JStrRef, Sym};

#[cfg(feature = "annex-b")]
use boa_ast::operations::annex_b_function_declarations_names;

/// `GlobalDeclarationInstantiation ( script, env )`
///
/// This diverges from the specification by separating the context from the compilation process.
/// Many steps are skipped that are done during bytecode compilation.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-globaldeclarationinstantiation
#[cfg(not(feature = "annex-b"))]
#[allow(clippy::unnecessary_wraps)]
#[allow(clippy::ptr_arg)]
pub(crate) fn global_declaration_instantiation_context(
    _annex_b_function_names: &mut Vec<Sym>,
    _script: &Script,
    _env: &Scope,
    _context: &mut Context,
) -> JsResult<()> {
    Ok(())
}

/// `GlobalDeclarationInstantiation ( script, env )`
///
/// This diverges from the specification by separating the context from the compilation process.
/// Many steps are skipped that are done during bytecode compilation.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-globaldeclarationinstantiation
#[cfg(feature = "annex-b")]
pub(crate) fn global_declaration_instantiation_context(
    annex_b_function_names: &mut Vec<Sym>,
    script: &Script,
    env: &Scope,
    context: &mut Context,
) -> JsResult<()> {
    // SKIP: 1. Let lexNames be the LexicallyDeclaredNames of script.
    // SKIP: 2. Let varNames be the VarDeclaredNames of script.
    // SKIP: 3. For each element name of lexNames, do
    // SKIP: 4. For each element name of varNames, do

    // 5. Let varDeclarations be the VarScopedDeclarations of script.
    // Note: VarScopedDeclarations for a Script node is TopLevelVarScopedDeclarations.
    let var_declarations = var_scoped_declarations(script);

    // SKIP: 6. Let functionsToInitialize be a new empty List.

    // 7. Let declaredFunctionNames be a new empty List.
    let mut declared_function_names = Vec::new();

    // 8. For each element d of varDeclarations, in reverse List order, do
    for declaration in var_declarations.iter().rev() {
        // a. If d is not either a VariableDeclaration, a ForBinding, or a BindingIdentifier, then
        // a.i. Assert: d is either a FunctionDeclaration, a GeneratorDeclaration, an AsyncFunctionDeclaration, or an AsyncGeneratorDeclaration.
        // a.ii. NOTE: If there are multiple function declarations for the same name, the last declaration is used.
        // a.iii. Let fn be the sole element of the BoundNames of d.
        let name = match declaration {
            VarScopedDeclaration::FunctionDeclaration(f) => f.name(),
            VarScopedDeclaration::GeneratorDeclaration(f) => f.name(),
            VarScopedDeclaration::AsyncFunctionDeclaration(f) => f.name(),
            VarScopedDeclaration::AsyncGeneratorDeclaration(f) => f.name(),
            VarScopedDeclaration::VariableDeclaration(_) => continue,
        };

        // a.iv. If declaredFunctionNames does not contain fn, then
        if !declared_function_names.contains(&name.sym()) {
            // SKIP: 1. Let fnDefinable be ? env.CanDeclareGlobalFunction(fn).
            // SKIP: 2. If fnDefinable is false, throw a TypeError exception.
            // 3. Append fn to declaredFunctionNames.
            declared_function_names.push(name.sym());

            // SKIP: 4. Insert d as the first element of functionsToInitialize.
        }
    }

    // // 9. Let declaredVarNames be a new empty List.
    let mut declared_var_names = Vec::new();

    // 10. For each element d of varDeclarations, do
    //     a. If d is either a VariableDeclaration, a ForBinding, or a BindingIdentifier, then
    for declaration in var_declarations {
        let VarScopedDeclaration::VariableDeclaration(declaration) = declaration else {
            continue;
        };

        // i. For each String vn of the BoundNames of d, do
        for name in bound_names(&declaration) {
            // 1. If declaredFunctionNames does not contain vn, then
            if !declared_function_names.contains(&name) {
                // SKIP: a. Let vnDefinable be ? env.CanDeclareGlobalVar(vn).
                // SKIP: b. If vnDefinable is false, throw a TypeError exception.
                // c. If declaredVarNames does not contain vn, then
                if !declared_var_names.contains(&name) {
                    // i. Append vn to declaredVarNames.
                    declared_var_names.push(name);
                }
            }
        }
    }

    // 11. NOTE: No abnormal terminations occur after this algorithm step if the global object is an ordinary object.
    //     However, if the global object is a Proxy exotic object it may exhibit behaviours
    //     that cause abnormal terminations in some of the following steps.

    // 12. NOTE: Annex B.3.2.2 adds additional steps at this point.
    // 12. Perform the following steps:
    // a. Let strict be IsStrict of script.
    // b. If strict is false, then
    if !script.strict() {
        let lex_names = lexically_declared_names(script);

        // i. Let declaredFunctionOrVarNames be the list-concatenation of declaredFunctionNames and declaredVarNames.
        // ii. For each FunctionDeclaration f that is directly contained in the StatementList of a Block, CaseClause,
        //     or DefaultClause Contained within script, do
        for f in annex_b_function_declarations_names(script) {
            // 1. Let F be StringValue of the BindingIdentifier of f.
            // 2. If replacing the FunctionDeclaration f with a VariableStatement that has F as a BindingIdentifier
            //    would not produce any Early Errors for script, then
            if !lex_names.contains(&f) {
                let f_string = f.to_js_string(context.interner());

                // a. If env.HasLexicalDeclaration(F) is false, then
                if !env.has_lex_binding(&f_string) {
                    // i. Let fnDefinable be ? env.CanDeclareGlobalVar(F).
                    let fn_definable = context.can_declare_global_function(&f_string)?;

                    // ii. If fnDefinable is true, then
                    if fn_definable {
                        // i. NOTE: A var binding for F is only instantiated here if it is neither
                        //          a VarDeclaredName nor the name of another FunctionDeclaration.
                        // ii. If declaredFunctionOrVarNames does not contain F, then
                        if !declared_function_names.contains(&f) && !declared_var_names.contains(&f)
                        {
                            // i. Perform ? env.CreateGlobalVarBinding(F, false).
                            context.create_global_var_binding(f_string, false)?;

                            // ii. Append F to declaredFunctionOrVarNames.
                            declared_function_names.push(f);
                        }
                        // iii. When the FunctionDeclaration f is evaluated, perform the following
                        //      steps in place of the FunctionDeclaration Evaluation algorithm provided in 15.2.6:
                        //     i. Let genv be the running execution context's VariableEnvironment.
                        //     ii. Let benv be the running execution context's LexicalEnvironment.
                        //     iii. Let fobj be ! benv.GetBindingValue(F, false).
                        //     iv. Perform ? genv.SetMutableBinding(F, fobj, false).
                        //     v. Return unused.
                        annex_b_function_names.push(f);
                    }
                }
            }
        }
    }

    // SKIP: 13. Let lexDeclarations be the LexicallyScopedDeclarations of script.
    // SKIP: 14. Let privateEnv be null.
    // SKIP: 15. For each element d of lexDeclarations, do
    // SKIP: 16. For each Parse Node f of functionsToInitialize, do
    // SKIP: 17. For each String vn of declaredVarNames, do

    // 18. Return unused.
    Ok(())
}

/// `EvalDeclarationInstantiation ( body, varEnv, lexEnv, privateEnv, strict )`
///
/// This diverges from the specification by separating the context from the compilation process.
/// Many steps are skipped that are done during bytecode compilation.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-evaldeclarationinstantiation
pub(crate) fn prepare_eval_declaration_instantiation(
    #[allow(unused, clippy::ptr_arg)] annex_b_function_names: &mut Vec<Sym>,
    body: &Script,
    #[allow(unused)] strict: bool,
    #[allow(unused)] var_env: &Scope,
    #[allow(unused)] lex_env: &Scope,
    context: &mut Context,
) -> JsResult<()> {
    // SKIP: 3. If strict is false, then

    // 4. Let privateIdentifiers be a new empty List.
    // 5. Let pointer be privateEnv.
    // 6. Repeat, while pointer is not null,
    //     a. For each Private Name binding of pointer.[[Names]], do
    //         i. If privateIdentifiers does not contain binding.[[Description]],
    //            append binding.[[Description]] to privateIdentifiers.
    //     b. Set pointer to pointer.[[OuterPrivateEnvironment]].
    let private_identifiers = context.vm.frame().environments.private_name_descriptions();
    let private_identifiers = private_identifiers
        .into_iter()
        .map(|ident| {
            // TODO: Replace JStrRef with JsStr this would eliminate the to_vec call.
            let ident = ident.to_vec();
            context
                .interner()
                .get(JStrRef::Utf16(&ident))
                .expect("string should be in interner")
        })
        .collect();

    // 7. If AllPrivateIdentifiersValid of body with argument privateIdentifiers is false, throw a SyntaxError exception.
    if !all_private_identifiers_valid(body, private_identifiers) {
        return Err(JsNativeError::syntax()
            .with_message("invalid private identifier")
            .into());
    }

    // 2. Let varDeclarations be the VarScopedDeclarations of body.
    #[cfg(feature = "annex-b")]
    let var_declarations = var_scoped_declarations(body);

    // SKIP: 8. Let functionsToInitialize be a new empty List.

    // 9. Let declaredFunctionNames be a new empty List.
    #[cfg(feature = "annex-b")]
    let mut declared_function_names = Vec::new();

    // 10. For each element d of varDeclarations, in reverse List order, do
    #[cfg(feature = "annex-b")]
    for declaration in var_declarations.iter().rev() {
        // a. If d is not either a VariableDeclaration, a ForBinding, or a BindingIdentifier, then
        // a.i. Assert: d is either a FunctionDeclaration, a GeneratorDeclaration, an AsyncFunctionDeclaration, or an AsyncGeneratorDeclaration.
        // a.ii. NOTE: If there are multiple function declarations for the same name, the last declaration is used.
        // a.iii. Let fn be the sole element of the BoundNames of d.
        let name = match &declaration {
            VarScopedDeclaration::FunctionDeclaration(f) => f.name(),
            VarScopedDeclaration::GeneratorDeclaration(f) => f.name(),
            VarScopedDeclaration::AsyncFunctionDeclaration(f) => f.name(),
            VarScopedDeclaration::AsyncGeneratorDeclaration(f) => f.name(),
            VarScopedDeclaration::VariableDeclaration(_) => continue,
        };

        // a.iv. If declaredFunctionNames does not contain fn, then
        if !declared_function_names.contains(&name.sym()) {
            // SKIP: 1. If varEnv is a Global Environment Record, then

            // 2. Append fn to declaredFunctionNames.
            declared_function_names.push(name.sym());

            // SKIP: 3. Insert d as the first element of functionsToInitialize.
        }
    }

    // 11. NOTE: Annex B.3.2.3 adds additional steps at this point.
    // 11. If strict is false, then
    #[cfg(feature = "annex-b")]
    if !strict {
        let lexically_declared_names = lexically_declared_names(body);

        // a. Let declaredFunctionOrVarNames be the list-concatenation of declaredFunctionNames and declaredVarNames.
        // b. For each FunctionDeclaration f that is directly contained in the StatementList
        //    of a Block, CaseClause, or DefaultClause Contained within body, do
        for f in annex_b_function_declarations_names(body) {
            // i. Let F be StringValue of the BindingIdentifier of f.
            // ii. If replacing the FunctionDeclaration f with a VariableStatement that has F
            //     as a BindingIdentifier would not produce any Early Errors for body, then
            if !lexically_declared_names.contains(&f) {
                // 1. Let bindingExists be false.
                let mut binding_exists = false;

                // 2. Let thisEnv be lexEnv.
                let mut this_env = lex_env;

                // 3. Assert: The following loop will terminate.
                // 4. Repeat, while thisEnv is not varEnv,
                while this_env.scope_index() != lex_env.scope_index() {
                    let f = f.to_js_string(context.interner());

                    // a. If thisEnv is not an Object Environment Record, then
                    // i. If ! thisEnv.HasBinding(F) is true, then
                    if this_env.has_binding(&f) {
                        // i. Let bindingExists be true.
                        binding_exists = true;
                        break;
                    }

                    // b. Set thisEnv to thisEnv.[[OuterEnv]].
                    if let Some(outer) = this_env.outer() {
                        this_env = outer;
                    } else {
                        break;
                    }
                }

                // 5. If bindingExists is false and varEnv is a Global Environment Record, then
                let fn_definable = if !binding_exists && var_env.is_global() {
                    let f = f.to_js_string(context.interner());

                    // a. If varEnv.HasLexicalDeclaration(F) is false, then
                    // b. Else,
                    if var_env.has_lex_binding(&f) {
                        // i. Let fnDefinable be false.
                        false
                    } else {
                        // i. Let fnDefinable be ? varEnv.CanDeclareGlobalVar(F).
                        context.can_declare_global_var(&f)?
                    }
                }
                // 6. Else,
                else {
                    // a. Let fnDefinable be true.
                    true
                };

                // 7. If bindingExists is false and fnDefinable is true, then
                if !binding_exists && fn_definable {
                    // a. If declaredFunctionOrVarNames does not contain F, then
                    if !declared_function_names.contains(&f) {
                        // i. If varEnv is a Global Environment Record, then
                        if var_env.is_global() {
                            let f = f.to_js_string(context.interner());

                            // i. Perform ? varEnv.CreateGlobalVarBinding(F, true).
                            context.create_global_var_binding(f, true)?;
                        }

                        // SKIP: ii. Else,
                        // SKIP: iii. Append F to declaredFunctionOrVarNames.
                    }

                    // b. When the FunctionDeclaration f is evaluated, perform the following steps
                    //    in place of the FunctionDeclaration Evaluation algorithm provided in 15.2.6:
                    //     i. Let genv be the running execution context's VariableEnvironment.
                    //     ii. Let benv be the running execution context's LexicalEnvironment.
                    //     iii. Let fobj be ! benv.GetBindingValue(F, false).
                    //     iv. Perform ? genv.SetMutableBinding(F, fobj, false).
                    //     v. Return unused.
                    annex_b_function_names.push(f);
                }
            }
        }
    }

    // SKIP: 12. Let declaredVarNames be a new empty List.
    // SKIP: 13. For each element d of varDeclarations, do
    // SKIP: 14. NOTE: No abnormal terminations occur after this algorithm step unless varEnv is a
    //           Global Environment Record and the global object is a Proxy exotic object.
    // SKIP: 15. Let lexDeclarations be the LexicallyScopedDeclarations of body.
    // SKIP: 16. For each element d of lexDeclarations, do
    // SKIP: 17. For each Parse Node f of functionsToInitialize, do
    // SKIP: 18. For each String vn of declaredVarNames, do

    // 19. Return unused.
    Ok(())
}

impl ByteCompiler<'_> {
    /// `GlobalDeclarationInstantiation ( script, env )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-globaldeclarationinstantiation
    pub(crate) fn global_declaration_instantiation(&mut self, script: &Script) {
        // 1. Let lexNames be the LexicallyDeclaredNames of script.
        let lex_names = lexically_declared_names(script);

        // 2. Let varNames be the VarDeclaredNames of script.
        // 3. For each element name of lexNames, do
        for name in lex_names {
            let name = name.to_js_string(self.interner());

            // c. Let hasRestrictedGlobal be ? env.HasRestrictedGlobalProperty(name).
            // d. If hasRestrictedGlobal is true, throw a SyntaxError exception.
            // Done in `Context::global_declaration_instantiation`
            let index = self.get_or_insert_string(name);
            self.global_lexs.push(index);
        }
        // 4. For each element name of varNames, do
        //    a. If HasLexicalDeclaration(env, name) is true, throw a SyntaxError exception.
        // The scope analyzer already does this check for us.

        // 5. Let varDeclarations be the VarScopedDeclarations of script.
        // Note: VarScopedDeclarations for a Script node is TopLevelVarScopedDeclarations.
        let var_declarations = var_scoped_declarations(script);

        // 6. Let functionsToInitialize be a new empty List.
        let mut functions_to_initialize = Vec::new();

        // 7. Let declaredFunctionNames be a new empty List.
        let mut declared_function_names = Vec::new();

        // 8. For each element d of varDeclarations, in reverse List order, do
        for declaration in var_declarations.iter().rev() {
            // a. If d is not either a VariableDeclaration, a ForBinding, or a BindingIdentifier, then
            // a.i. Assert: d is either a FunctionDeclaration, a GeneratorDeclaration, an AsyncFunctionDeclaration, or an AsyncGeneratorDeclaration.
            // a.ii. NOTE: If there are multiple function declarations for the same name, the last declaration is used.
            // a.iii. Let fn be the sole element of the BoundNames of d.
            let name = match declaration {
                VarScopedDeclaration::FunctionDeclaration(f) => f.name(),
                VarScopedDeclaration::GeneratorDeclaration(f) => f.name(),
                VarScopedDeclaration::AsyncFunctionDeclaration(f) => f.name(),
                VarScopedDeclaration::AsyncGeneratorDeclaration(f) => f.name(),
                VarScopedDeclaration::VariableDeclaration(_) => continue,
            };

            // a.iv. If declaredFunctionNames does not contain fn, then
            if !declared_function_names.contains(&name.sym()) {
                // 1. Let fnDefinable be ? env.CanDeclareGlobalFunction(fn).
                // 2. If fnDefinable is false, throw a TypeError exception.
                // Done in `Context::global_declaration_instantiation`.
                // The names checked here are the same names from the functions
                // in `functions_to_initialize`, but in reverse order, so we can
                // reuse `global_fns` for this check.

                // 3. Append fn to declaredFunctionNames.
                declared_function_names.push(name.sym());

                // 4. Insert d as the first element of functionsToInitialize.
                functions_to_initialize.push(declaration.clone());
            }
        }

        functions_to_initialize.reverse();

        // 9. Let declaredVarNames be a new empty List.
        let mut declared_var_names = Vec::new();

        // 10. For each element d of varDeclarations, do
        //     a. If d is either a VariableDeclaration, a ForBinding, or a BindingIdentifier, then
        for declaration in var_declarations {
            let VarScopedDeclaration::VariableDeclaration(declaration) = declaration else {
                continue;
            };

            // i. For each String vn of the BoundNames of d, do
            for name in bound_names(&declaration) {
                // 1. If declaredFunctionNames does not contain vn, then
                if !declared_function_names.contains(&name) {
                    // a. Let vnDefinable be ? env.CanDeclareGlobalVar(vn).
                    // b. If vnDefinable is false, throw a TypeError exception.
                    // Done in `Context::global_declaration_instantiation`
                    // The names checked here are the same names from the functions
                    // in `declared_var_names`, so we can reuse `global_vars`
                    // for this check.

                    // c. If declaredVarNames does not contain vn, then
                    if !declared_var_names.contains(&name) {
                        // i. Append vn to declaredVarNames.
                        declared_var_names.push(name);
                    }
                }
            }
        }

        // 11. NOTE: No abnormal terminations occur after this algorithm step if the
        //     global object is an ordinary object. However, if the global object is
        //     a Proxy exotic object it may exhibit behaviours that cause abnormal
        //     terminations in some of the following steps.

        // Steps 13-15 are covered by the scope analyzer.

        // 16. For each Parse Node f of functionsToInitialize, do
        for function in functions_to_initialize {
            // a. Let fn be the sole element of the BoundNames of f.
            let (name, generator, r#async, parameters, body, scopes, contains_direct_eval) =
                match &function {
                    VarScopedDeclaration::FunctionDeclaration(f) => (
                        f.name(),
                        false,
                        false,
                        f.parameters(),
                        f.body(),
                        f.scopes().clone(),
                        f.contains_direct_eval(),
                    ),
                    VarScopedDeclaration::GeneratorDeclaration(f) => (
                        f.name(),
                        true,
                        false,
                        f.parameters(),
                        f.body(),
                        f.scopes().clone(),
                        f.contains_direct_eval(),
                    ),
                    VarScopedDeclaration::AsyncFunctionDeclaration(f) => (
                        f.name(),
                        false,
                        true,
                        f.parameters(),
                        f.body(),
                        f.scopes().clone(),
                        f.contains_direct_eval(),
                    ),
                    VarScopedDeclaration::AsyncGeneratorDeclaration(f) => (
                        f.name(),
                        true,
                        true,
                        f.parameters(),
                        f.body(),
                        f.scopes().clone(),
                        f.contains_direct_eval(),
                    ),
                    VarScopedDeclaration::VariableDeclaration(_) => continue,
                };

            let func_span = function.linear_span();
            let spanned_source_text = SpannedSourceText::new(self.source_text(), func_span);

            let code = FunctionCompiler::new(spanned_source_text)
                .name(name.sym().to_js_string(self.interner()))
                .generator(generator)
                .r#async(r#async)
                .strict(self.strict())
                .in_with(self.in_with)
                .source_path(self.source_path.clone())
                .compile(
                    parameters,
                    body,
                    self.variable_scope.clone(),
                    self.lexical_scope.clone(),
                    &scopes,
                    contains_direct_eval,
                    self.interner,
                );

            // Ensures global functions are printed when generating the global flowgraph.
            let name_index = self.get_or_insert_name(name.sym());
            let function_index = self.push_function_to_constants(code);

            // b. Let fo be InstantiateFunctionObject of f with arguments env and privateEnv.
            // c. Perform ? env.CreateGlobalFunctionBinding(fn, fo, false).
            // Done in `Context::global_declaration_instantiation`
            self.global_fns.push(GlobalFunctionBinding {
                name_index,
                function_index,
            });
        }

        // 17 is done in `Context::global_declaration_instantiation

        // 17. For each String vn of declaredVarNames, do
        for var in declared_var_names {
            let index = self.get_or_insert_name(var);
            self.global_vars.push(index);

            // a. Perform ? env.CreateGlobalVarBinding(vn, false).
            // Done in `Context::global_declaration_instantiation`
        }

        // 18. Return unused.
    }

    /// `BlockDeclarationInstantiation ( code, env )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-blockdeclarationinstantiation
    pub(crate) fn block_declaration_instantiation<'a, N>(&mut self, block: &'a N)
    where
        &'a N: Into<NodeRef<'a>>,
    {
        // 1. Let declarations be the LexicallyScopedDeclarations of code.
        let declarations = lexically_scoped_declarations(block);

        // Note: Not sure if the spec is wrong here or if our implementation just differs too much,
        //       but we need 3.a to be finished for all declarations before 3.b can be done.

        // b. If d is either a FunctionDeclaration, a GeneratorDeclaration, an AsyncFunctionDeclaration, or an AsyncGeneratorDeclaration, then
        //     i. Let fn be the sole element of the BoundNames of d.
        //     ii. Let fo be InstantiateFunctionObject of d with arguments env and privateEnv.
        //     iii. Perform ! env.InitializeBinding(fn, fo). NOTE: This step is replaced in section B.3.2.6.
        // TODO: Support B.3.2.6.
        for d in declarations {
            match d {
                LexicallyScopedDeclaration::FunctionDeclaration(function) => {
                    let dst = self.register_allocator.alloc();
                    self.function_with_binding(function.into(), NodeKind::Declaration, &dst);
                    self.register_allocator.dealloc(dst);
                }
                LexicallyScopedDeclaration::GeneratorDeclaration(function) => {
                    let dst = self.register_allocator.alloc();
                    self.function_with_binding(function.into(), NodeKind::Declaration, &dst);
                    self.register_allocator.dealloc(dst);
                }
                LexicallyScopedDeclaration::AsyncFunctionDeclaration(function) => {
                    let dst = self.register_allocator.alloc();
                    self.function_with_binding(function.into(), NodeKind::Declaration, &dst);
                    self.register_allocator.dealloc(dst);
                }
                LexicallyScopedDeclaration::AsyncGeneratorDeclaration(function) => {
                    let dst = self.register_allocator.alloc();
                    self.function_with_binding(function.into(), NodeKind::Declaration, &dst);
                    self.register_allocator.dealloc(dst);
                }
                _ => {}
            }
        }

        // 4. Return unused.
    }

    /// `EvalDeclarationInstantiation ( body, varEnv, lexEnv, privateEnv, strict )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-evaldeclarationinstantiation
    pub(crate) fn eval_declaration_instantiation(
        &mut self,
        body: &Script,
        #[allow(
            unused_variables,
            reason = "only used when the `annex-b` feature is enabled"
        )]
        strict: bool,
        var_env: &Scope,
        bindings: EvalDeclarationBindings,
    ) {
        // 2. Let varDeclarations be the VarScopedDeclarations of body.
        let var_declarations = var_scoped_declarations(body);

        // SKIP: 3. If strict is false, then
        // covered by the scope analyzer.

        // NOTE: These steps depend on the current environment state are done before bytecode compilation,
        //       in `eval_declaration_instantiation_context`.
        //
        // SKIP: 4. Let privateIdentifiers be a new empty List.
        // SKIP: 5. Let pointer be privateEnv.
        // SKIP: 6. Repeat, while pointer is not null,
        //           a. For each Private Name binding of pointer.[[Names]], do
        //               i. If privateIdentifiers does not contain binding.[[Description]],
        //                  append binding.[[Description]] to privateIdentifiers.
        //           b. Set pointer to pointer.[[OuterPrivateEnvironment]].
        // SKIP: 7. If AllPrivateIdentifiersValid of body with argument privateIdentifiers is false, throw a SyntaxError exception.

        // 8. Let functionsToInitialize be a new empty List.
        let mut functions_to_initialize = Vec::new();

        // 9. Let declaredFunctionNames be a new empty List.
        let mut declared_function_names = Vec::new();

        // 10. For each element d of varDeclarations, in reverse List order, do
        for declaration in var_declarations.iter().rev() {
            // a. If d is not either a VariableDeclaration, a ForBinding, or a BindingIdentifier, then
            // a.i. Assert: d is either a FunctionDeclaration, a GeneratorDeclaration, an AsyncFunctionDeclaration, or an AsyncGeneratorDeclaration.
            // a.ii. NOTE: If there are multiple function declarations for the same name, the last declaration is used.
            // a.iii. Let fn be the sole element of the BoundNames of d.
            let name = match &declaration {
                VarScopedDeclaration::FunctionDeclaration(f) => f.name(),
                VarScopedDeclaration::GeneratorDeclaration(f) => f.name(),
                VarScopedDeclaration::AsyncFunctionDeclaration(f) => f.name(),
                VarScopedDeclaration::AsyncGeneratorDeclaration(f) => f.name(),
                VarScopedDeclaration::VariableDeclaration(_) => continue,
            };
            // a.iv. If declaredFunctionNames does not contain fn, then
            if !declared_function_names.contains(&name.sym()) {
                // 1. If varEnv is a Global Environment Record, then
                //    a. Let fnDefinable be ? varEnv.CanDeclareGlobalFunction(fn).
                //    b. If fnDefinable is false, throw a TypeError exception.
                //    Done in `Context::eval_declaration_instantiation`
                //    The names checked here are the same names from the functions
                //    in `functions_to_initialize`, but in reverse order, so we can
                //    reuse `global_fns` for this check.

                // 2. Append fn to declaredFunctionNames.
                declared_function_names.push(name.sym());

                // 3. Insert d as the first element of functionsToInitialize.
                functions_to_initialize.push(declaration.clone());
            }
        }

        functions_to_initialize.reverse();

        // 11. NOTE: Annex B.3.2.3 adds additional steps at this point.
        // 11. If strict is false, then
        #[cfg(feature = "annex-b")]
        if !strict {
            // NOTE: This diviates from the specification, we split the first part of defining the annex-b names
            //       in `eval_declaration_instantiation_context`, because it depends on the context.
            if !var_env.is_global() {
                for binding in bindings.new_annex_b_function_names {
                    // i. Let bindingExists be ! varEnv.HasBinding(F).
                    // ii. If bindingExists is false, then
                    // i. Perform ! varEnv.CreateMutableBinding(F, true).
                    // ii. Perform ! varEnv.InitializeBinding(F, undefined).

                    use crate::vm::CallFrame;
                    let index = self.insert_binding(binding);
                    self.emit_binding_access(
                        BindingAccessOpcode::DefInitVar,
                        &index,
                        &CallFrame::undefined_register(),
                    );
                }
            }
        }

        // 12. Let declaredVarNames be a new empty List.
        let mut declared_var_names = Vec::new();

        // 13. For each element d of varDeclarations, do
        for declaration in var_declarations {
            // a. If d is either a VariableDeclaration, a ForBinding, or a BindingIdentifier, then
            let VarScopedDeclaration::VariableDeclaration(declaration) = declaration else {
                continue;
            };

            // a.i. For each String vn of the BoundNames of d, do
            for name in bound_names(&declaration) {
                // 1. If declaredFunctionNames does not contain vn, then
                if !declared_function_names.contains(&name) {
                    // a. If varEnv is a Global Environment Record, then
                    //    i. Let vnDefinable be ? varEnv.CanDeclareGlobalVar(vn).
                    //    ii. If vnDefinable is false, throw a TypeError exception.
                    //    Done in `Context::eval_declaration_instantiation`
                    //    The names checked here are the same names from the functions
                    //    in `declared_var_names`, so we can reuse `global_vars`
                    //    for this check.

                    // b. If declaredVarNames does not contain vn, then
                    if !declared_var_names.contains(&name) {
                        // i. Append vn to declaredVarNames.
                        declared_var_names.push(name);
                    }
                }
            }
        }

        // 14. NOTE: No abnormal terminations occur after this algorithm step unless varEnv is a
        //           Global Environment Record and the global object is a Proxy exotic object.

        // 15. Let lexDeclarations be the LexicallyScopedDeclarations of body.
        // 16. For each element d of lexDeclarations, do

        // 17. For each Parse Node f of functionsToInitialize, do
        for function in functions_to_initialize {
            // a. Let fn be the sole element of the BoundNames of f.
            let (name, generator, r#async, parameters, body, scopes, contains_direct_eval) =
                match &function {
                    VarScopedDeclaration::FunctionDeclaration(f) => (
                        f.name(),
                        false,
                        false,
                        f.parameters(),
                        f.body(),
                        f.scopes().clone(),
                        f.contains_direct_eval(),
                    ),
                    VarScopedDeclaration::GeneratorDeclaration(f) => (
                        f.name(),
                        true,
                        false,
                        f.parameters(),
                        f.body(),
                        f.scopes().clone(),
                        f.contains_direct_eval(),
                    ),
                    VarScopedDeclaration::AsyncFunctionDeclaration(f) => (
                        f.name(),
                        false,
                        true,
                        f.parameters(),
                        f.body(),
                        f.scopes().clone(),
                        f.contains_direct_eval(),
                    ),
                    VarScopedDeclaration::AsyncGeneratorDeclaration(f) => (
                        f.name(),
                        true,
                        true,
                        f.parameters(),
                        f.body(),
                        f.scopes().clone(),
                        f.contains_direct_eval(),
                    ),
                    VarScopedDeclaration::VariableDeclaration(_) => {
                        continue;
                    }
                };

            let func_span = function.linear_span();
            let spanned_source_text = SpannedSourceText::new(self.source_text(), func_span);

            let code = FunctionCompiler::new(spanned_source_text)
                .name(name.sym().to_js_string(self.interner()))
                .generator(generator)
                .r#async(r#async)
                .strict(self.strict())
                .in_with(self.in_with)
                .name_scope(None)
                .compile(
                    parameters,
                    body,
                    self.variable_scope.clone(),
                    self.lexical_scope.clone(),
                    &scopes,
                    contains_direct_eval,
                    self.interner,
                );

            // b. Let fo be InstantiateFunctionObject of f with arguments lexEnv and privateEnv.
            let index = self.push_function_to_constants(code);

            // c. If varEnv is a Global Environment Record, then
            if var_env.is_global() {
                // i. Perform ? varEnv.CreateGlobalFunctionBinding(fn, fo, true).
                // Done in `Context::eval_declaration_instantiation`
                let name_index = self.get_or_insert_name(name.sym());
                self.global_fns.push(GlobalFunctionBinding {
                    name_index,
                    function_index: index,
                });
            }
            // d. Else,
            else {
                let dst = self.register_allocator.alloc();
                self.emit_get_function(&dst, index);

                // i. Let bindingExists be ! varEnv.HasBinding(fn).
                let binding = bindings
                    .new_function_names
                    .get(&name)
                    .expect("binding must exist");

                // ii. If bindingExists is false, then
                // 1. NOTE: The following invocation cannot return an abrupt completion because of the validation preceding step 14.
                // 2. Perform ! varEnv.CreateMutableBinding(fn, true).
                // 3. Perform ! varEnv.InitializeBinding(fn, fo).
                // iii. Else,
                // 1. Perform ! varEnv.SetMutableBinding(fn, fo, false).
                let index = self.insert_binding(binding.clone());
                self.emit_binding_access(BindingAccessOpcode::DefInitVar, &index, &dst);
                self.register_allocator.dealloc(dst);
            }
        }

        // 18. For each String vn of declaredVarNames, do
        for name in declared_var_names {
            // a. If varEnv is a Global Environment Record, then
            if var_env.is_global() {
                let index = self.get_or_insert_name(name);

                // i. Perform ? varEnv.CreateGlobalVarBinding(vn, true).
                // Done in `Context::eval_declaration_instantiation`
                self.global_vars.push(index);
            }
        }
        // 18.b
        for binding in bindings.declared_var_names {
            // i. Let bindingExists be ! varEnv.HasBinding(vn).
            // ii. If bindingExists is false, then
            // 1. NOTE: The following invocation cannot return an abrupt completion because of the validation preceding step 14.
            // 2. Perform ! varEnv.CreateMutableBinding(vn, true).
            // 3. Perform ! varEnv.InitializeBinding(vn, undefined).
            let index = self.insert_binding(binding);
            self.emit_binding_access(
                BindingAccessOpcode::DefEvalVar,
                &index,
                &CallFrame::undefined_register(),
            );
        }

        // 19. Return unused.
    }

    /// `FunctionDeclarationInstantiation ( func, argumentsList )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-functiondeclarationinstantiation
    pub(crate) fn function_declaration_instantiation(
        &mut self,
        body: &FunctionBody,
        formals: &FormalParameterList,
        arrow: bool,
        strict: bool,
        generator: bool,
        scopes: &FunctionScopes,
    ) {
        // 1. Let calleeContext be the running execution context.
        // 2. Let code be func.[[ECMAScriptCode]].
        // 3. Let strict be func.[[Strict]].
        // 4. Let formals be func.[[FormalParameters]].

        // 5. Let parameterNames be the BoundNames of formals.
        let mut parameter_names = bound_names(formals);

        // 6. If parameterNames has any duplicate entries, let hasDuplicates be true. Otherwise, let hasDuplicates be false.
        // let has_duplicates = formals.has_duplicates();

        // 7. Let simpleParameterList be IsSimpleParameterList of formals.
        // let simple_parameter_list = formals.is_simple();

        // 8. Let hasParameterExpressions be ContainsExpression of formals.
        let has_parameter_expressions = formals.has_expressions();

        // 9. Let varNames be the VarDeclaredNames of code.
        let var_names = var_declared_names(body);

        // 10. Let varDeclarations be the VarScopedDeclarations of code.
        let var_declarations = var_scoped_declarations(body);

        // 11. Let lexicalNames be the LexicallyDeclaredNames of code.
        let lexical_names = lexically_declared_names(body);

        // 12. Let functionNames be a new empty List.
        let mut function_names = Vec::new();

        // 13. Let functionsToInitialize be a new empty List.
        let mut functions_to_initialize = Vec::new();

        // 14. For each element d of varDeclarations, in reverse List order, do
        for declaration in var_declarations.iter().rev() {
            // a. If d is neither a VariableDeclaration nor a ForBinding nor a BindingIdentifier, then
            // a.i. Assert: d is either a FunctionDeclaration, a GeneratorDeclaration, an AsyncFunctionDeclaration, or an AsyncGeneratorDeclaration.
            // a.ii. Let fn be the sole element of the BoundNames of d.
            let (name, function) = match declaration {
                VarScopedDeclaration::FunctionDeclaration(f) => (f.name(), FunctionSpec::from(f)),
                VarScopedDeclaration::GeneratorDeclaration(f) => (f.name(), FunctionSpec::from(f)),
                VarScopedDeclaration::AsyncFunctionDeclaration(f) => {
                    (f.name(), FunctionSpec::from(f))
                }
                VarScopedDeclaration::AsyncGeneratorDeclaration(f) => {
                    (f.name(), FunctionSpec::from(f))
                }
                VarScopedDeclaration::VariableDeclaration(_) => continue,
            };

            // a.iii. If functionNames does not contain fn, then
            if !function_names.contains(&name.sym()) {
                // 1. Insert fn as the first element of functionNames.
                function_names.push(name.sym());

                // 2. NOTE: If there are multiple function declarations for the same name, the last declaration is used.
                // 3. Insert d as the first element of functionsToInitialize.
                functions_to_initialize.push(function);
            }
        }

        function_names.reverse();
        functions_to_initialize.reverse();

        // 15. Let argumentsObjectNeeded be true.
        let mut arguments_object_needed = true;

        let arguments = Sym::ARGUMENTS;

        // 16. If func.[[ThisMode]] is lexical, then
        // 17. Else if parameterNames contains "arguments", then
        if arrow || parameter_names.contains(&arguments) {
            // 16.a. NOTE: Arrow functions never have an arguments object.
            // 16.b. Set argumentsObjectNeeded to false.
            // 17.a. Set argumentsObjectNeeded to false.
            arguments_object_needed = false;
        }
        // 18. Else if hasParameterExpressions is false, then
        else if !has_parameter_expressions {
            //a. If functionNames contains "arguments" or lexicalNames contains "arguments", then
            if function_names.contains(&arguments) || lexical_names.contains(&arguments) {
                // i. Set argumentsObjectNeeded to false.
                arguments_object_needed = false;
            }
        }

        if arguments_object_needed {
            arguments_object_needed = scopes.arguments_object_accessed();
        }

        // 19-20
        drop(self.push_declarative_scope(scopes.parameters_eval_scope()));

        let scope = self.lexical_scope.clone();

        // 22. If argumentsObjectNeeded is true, then
        //
        // NOTE(HalidOdat): Has been moved up, so "arguments" gets registered as
        //     the first binding in the environment with index 0.
        if arguments_object_needed {
            let arguments = arguments.to_js_string(self.interner());

            // a. If strict is true or simpleParameterList is false, then
            let value = self.register_allocator.alloc();
            if strict || !formals.is_simple() {
                // i. Let ao be CreateUnmappedArgumentsObject(argumentsList).
                self.bytecode
                    .emit_create_unmapped_arguments_object(value.variable());
            }
            // b. Else,
            else {
                // i. NOTE: A mapped argument object is only provided for non-strict functions
                //          that don't have a rest parameter, any parameter
                //          default value initializers, or any destructured parameters.
                // ii. Let ao be CreateMappedArgumentsObject(func, formals, argumentsList, env).
                self.bytecode
                    .emit_create_mapped_arguments_object(value.variable());
                self.emitted_mapped_arguments_object_opcode = true;
            }

            // e. Perform ! env.InitializeBinding("arguments", ao).
            self.emit_binding(BindingOpcode::InitLexical, arguments, &value);
            self.register_allocator.dealloc(value);
        }

        // 22. If argumentsObjectNeeded is true, then
        if arguments_object_needed {
            // MOVED: a-e.
            //
            // NOTE(HalidOdat): Has been moved up, see comment above.

            // f. Let parameterBindings be the list-concatenation of parameterNames and « "arguments" ».
            parameter_names.push(arguments);
        }

        // 23. Else,
        //     a. Let parameterBindings be parameterNames.
        let parameter_bindings = parameter_names.clone();

        // 24. Let iteratorRecord be CreateListIteratorRecord(argumentsList).
        // 25. If hasDuplicates is true, then
        //    a. Perform ? IteratorBindingInitialization of formals with arguments iteratorRecord and undefined.
        // 26. Else,
        //    a. Perform ? IteratorBindingInitialization of formals with arguments iteratorRecord and env.
        for (i, parameter) in formals.as_ref().iter().enumerate() {
            let value = self.register_allocator.alloc();
            if parameter.is_rest_param() {
                self.bytecode.emit_rest_parameter_init(value.variable());
            } else {
                self.bytecode
                    .emit_get_argument((i as u32).into(), value.variable());
            }

            match parameter.variable().binding() {
                Binding::Identifier(ident) => {
                    let ident = ident.to_js_string(self.interner());
                    if let Some(init) = parameter.variable().init() {
                        let skip = self.jump_if_not_undefined(&value);
                        self.compile_expr(init, &value);
                        self.patch_jump(skip);
                    }
                    self.emit_binding(BindingOpcode::InitLexical, ident, &value);
                }
                Binding::Pattern(pattern) => {
                    if let Some(init) = parameter.variable().init() {
                        let skip = self.jump_if_not_undefined(&value);
                        self.compile_expr(init, &value);
                        self.patch_jump(skip);
                    }
                    self.compile_declaration_pattern(pattern, BindingOpcode::InitLexical, &value);
                }
            }
            self.register_allocator.dealloc(value);
        }

        if generator {
            if self.is_async() {
                self.bytecode.emit_async_generator();
            } else {
                self.bytecode.emit_generator();
            }
            self.bytecode.emit_pop();
        }

        // 27. If hasParameterExpressions is false, then
        // 28. Else,
        #[allow(unused_variables, unused_mut)]
        let (mut instantiated_var_names, mut variable_scope) =
            if let Some(scope) = scopes.parameters_scope() {
                // a. NOTE: A separate Environment Record is needed to ensure that closures created by
                //          expressions in the formal parameter list do not have
                //          visibility of declarations in the function body.
                // b. Let varEnv be NewDeclarativeEnvironment(env).
                // c. Set the VariableEnvironment of calleeContext to varEnv.
                drop(self.push_declarative_scope(Some(scope)));

                let mut variable_scope = self.lexical_scope.clone();

                // d. Let instantiatedVarNames be a new empty List.
                let mut instantiated_var_names = Vec::new();

                // e. For each element n of varNames, do
                for n in var_names {
                    // i. If instantiatedVarNames does not contain n, then
                    if !instantiated_var_names.contains(&n) {
                        // 1. Append n to instantiatedVarNames.
                        instantiated_var_names.push(n);

                        let n_string = n.to_js_string(self.interner());

                        // 2. Perform ! varEnv.CreateMutableBinding(n, false).
                        let binding = variable_scope
                            .get_binding_reference(&n_string)
                            .expect("must have binding");

                        let value = self.register_allocator.alloc();
                        // 3. If parameterBindings does not contain n, or if functionNames contains n, then
                        if !parameter_bindings.contains(&n) || function_names.contains(&n) {
                            // a. Let initialValue be undefined.
                            self.bytecode.emit_store_undefined(value.variable());
                        }
                        // 4. Else,
                        else {
                            // a. Let initialValue be ! env.GetBindingValue(n, false).
                            let binding = scope
                                .get_binding_reference(&n_string)
                                .expect("must have binding");
                            let index = self.get_binding(&binding);
                            self.emit_binding_access(BindingAccessOpcode::GetName, &index, &value);
                        }

                        // 5. Perform ! varEnv.InitializeBinding(n, initialValue).
                        let index = self.insert_binding(binding);

                        // TODO: What?
                        self.bytecode.emit_store_undefined(value.variable());
                        self.emit_binding_access(BindingAccessOpcode::DefInitVar, &index, &value);
                        self.register_allocator.dealloc(value);

                        // 6. NOTE: A var with the same name as a formal parameter initially has
                        //          the same value as the corresponding initialized parameter.
                    }
                }

                (instantiated_var_names, variable_scope)
            } else {
                // a. NOTE: Only a single Environment Record is needed for the parameters and top-level vars.
                // b. Let instantiatedVarNames be a copy of the List parameterBindings.
                let mut instantiated_var_names = parameter_bindings;

                // c. For each element n of varNames, do
                for n in var_names {
                    // i. If instantiatedVarNames does not contain n, then
                    if !instantiated_var_names.contains(&n) {
                        // 1. Append n to instantiatedVarNames.
                        instantiated_var_names.push(n);

                        let n = n.to_js_string(self.interner());

                        // 2. Perform ! env.CreateMutableBinding(n, false).
                        // 3. Perform ! env.InitializeBinding(n, undefined).
                        let binding = scope.get_binding_reference(&n).expect("binding must exist");
                        let index = self.insert_binding(binding);
                        self.emit_binding_access(
                            BindingAccessOpcode::DefInitVar,
                            &index,
                            &CallFrame::undefined_register(),
                        );
                    }
                }

                // d. Let varEnv be env.
                (instantiated_var_names, scope)
            };

        // 29. NOTE: Annex B.3.2.1 adds additional steps at this point.
        // 29. If strict is false, then
        #[cfg(feature = "annex-b")]
        if !strict {
            // a. For each FunctionDeclaration f that is directly contained in the StatementList
            //    of a Block, CaseClause, or DefaultClause, do
            for f in annex_b_function_declarations_names(body) {
                // i. Let F be StringValue of the BindingIdentifier of f.
                // ii. If replacing the FunctionDeclaration f with a VariableStatement that has F
                //     as a BindingIdentifier would not produce any Early Errors
                //     for func and parameterNames does not contain F, then
                if !lexical_names.contains(&f) && !parameter_names.contains(&f) {
                    // 1. NOTE: A var binding for F is only instantiated here if it is neither a
                    //    VarDeclaredName, the name of a formal parameter, or another FunctionDeclaration.

                    // 2. If initializedBindings does not contain F and F is not "arguments", then
                    if !instantiated_var_names.contains(&f) && f != arguments {
                        let f_string = f.to_js_string(self.interner());

                        // a. Perform ! varEnv.CreateMutableBinding(F, false).
                        // b. Perform ! varEnv.InitializeBinding(F, undefined).
                        let binding = variable_scope
                            .get_binding_reference(&f_string)
                            .expect("binding must exist");
                        let index = self.insert_binding(binding);
                        self.emit_binding_access(
                            BindingAccessOpcode::DefInitVar,
                            &index,
                            &CallFrame::undefined_register(),
                        );

                        // c. Append F to instantiatedVarNames.
                        instantiated_var_names.push(f);
                    }

                    // 3. When the FunctionDeclaration f is evaluated, perform the following steps
                    //    in place of the FunctionDeclaration Evaluation algorithm provided in 15.2.6:
                    //     a. Let fenv be the running execution context's VariableEnvironment.
                    //     b. Let benv be the running execution context's LexicalEnvironment.
                    //     c. Let fobj be ! benv.GetBindingValue(F, false).
                    //     d. Perform ! fenv.SetMutableBinding(F, fobj, false).
                    //     e. Return unused.
                    self.annex_b_function_names.push(f);
                }
            }
        }

        // 30-31
        drop(self.push_declarative_scope(scopes.lexical_scope()));

        // 35. Let privateEnv be the PrivateEnvironment of calleeContext.
        // 36. For each Parse Node f of functionsToInitialize, do
        for function in functions_to_initialize {
            // a. Let fn be the sole element of the BoundNames of f.
            // b. Let fo be InstantiateFunctionObject of f with arguments lexEnv and privateEnv.
            // c. Perform ! varEnv.SetMutableBinding(fn, fo, false).
            let dst = self.register_allocator.alloc();
            self.function_with_binding(function, NodeKind::Declaration, &dst);
            self.register_allocator.dealloc(dst);
        }

        // 37. Return unused.
    }
}
