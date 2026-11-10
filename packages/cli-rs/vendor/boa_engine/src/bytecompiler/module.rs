use super::{ByteCompiler, Literal, ToJsString};
use crate::vm::opcode::BindingOpcode;
use boa_ast::{ModuleItem, ModuleItemList, declaration::ExportDeclaration};
use boa_interner::Sym;

impl ByteCompiler<'_> {
    /// Compiles a [`ModuleItemList`].
    #[inline]
    pub fn compile_module_item_list(&mut self, list: &ModuleItemList) {
        for node in list.items() {
            self.compile_module_item(node);
        }
    }

    /// Compiles a [`ModuleItem`].
    #[inline]
    pub fn compile_module_item(&mut self, item: &ModuleItem) {
        match item {
            ModuleItem::StatementListItem(stmt) => {
                self.compile_stmt_list_item(stmt, false, false);
            }
            ModuleItem::ImportDeclaration(_) => {
                // ModuleItem : ImportDeclaration

                // 1. Return empty.
            }
            ModuleItem::ExportDeclaration(export) => {
                #[allow(clippy::match_same_arms)]
                match export.as_ref() {
                    ExportDeclaration::ReExport { .. } | ExportDeclaration::List(_) => {
                        // ExportDeclaration :
                        //    export ExportFromClause FromClause ;
                        //    export NamedExports ;
                        //        1. Return empty.
                    }
                    ExportDeclaration::DefaultFunctionDeclaration(_)
                    | ExportDeclaration::DefaultGeneratorDeclaration(_)
                    | ExportDeclaration::DefaultAsyncFunctionDeclaration(_)
                    | ExportDeclaration::DefaultAsyncGeneratorDeclaration(_) => {
                        // Already instantiated in `initialize_environment`.
                    }
                    ExportDeclaration::VarStatement(var) => self.compile_var_decl(var),
                    ExportDeclaration::Declaration(decl) => self.compile_decl(decl, false),
                    ExportDeclaration::DefaultClassDeclaration(cl) => {
                        // 2. Let className be the sole element of BoundNames of ClassDeclaration.
                        // 3. If className is "*default*", then
                        if cl.name().sym() == Sym::DEFAULT_EXPORT {
                            let class = self.register_allocator.alloc();

                            // 1. Let value be ? BindingClassDeclarationEvaluation of ClassDeclaration.
                            self.compile_class(cl.as_ref().into(), Some(&class));

                            // a. Let env be the running execution context's LexicalEnvironment.
                            // b. Perform ? InitializeBoundName("*default*", value, env).
                            let default_export = self
                                .interner()
                                .resolve_expect(Sym::DEFAULT_EXPORT)
                                .into_common(false);
                            self.emit_binding(BindingOpcode::InitLexical, default_export, &class);

                            self.register_allocator.dealloc(class);
                        } else {
                            // 1. Let value be ? BindingClassDeclarationEvaluation of ClassDeclaration.
                            self.compile_class(cl.as_ref().into(), None);
                        }
                    }
                    ExportDeclaration::DefaultAssignmentExpression(expr) => {
                        let function = self.register_allocator.alloc();
                        self.compile_expr(expr, &function);

                        if expr.is_anonymous_function_definition() {
                            let default = self
                                .interner()
                                .resolve_expect(Sym::DEFAULT)
                                .into_common(false);
                            let key = self.register_allocator.alloc();
                            self.emit_store_literal(Literal::String(default), &key);
                            self.bytecode.emit_set_function_name(
                                function.variable(),
                                key.variable(),
                                0u32.into(),
                            );
                            self.register_allocator.dealloc(key);
                        }

                        let name = Sym::DEFAULT_EXPORT.to_js_string(self.interner());
                        self.emit_binding(BindingOpcode::InitLexical, name, &function);
                        self.register_allocator.dealloc(function);
                    }
                }
            }
        }
    }
}
