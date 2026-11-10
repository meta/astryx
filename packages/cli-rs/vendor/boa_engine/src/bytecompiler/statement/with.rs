use crate::bytecompiler::ByteCompiler;
use boa_ast::statement::With;

impl ByteCompiler<'_> {
    /// Compile a [`With`] `boa_ast` node
    pub(crate) fn compile_with(&mut self, with: &With, use_expr: bool) {
        let object = self.register_allocator.alloc();
        self.compile_expr(with.expression(), &object);

        let outer_scope = self.lexical_scope.clone();
        let _ = self.push_scope(with.scope());
        self.bytecode
            .emit_push_object_environment(object.variable());
        self.register_allocator.dealloc(object);

        let in_with = self.in_with;
        self.in_with = true;
        self.compile_stmt(with.statement(), use_expr, true);
        self.in_with = in_with;

        self.pop_scope();
        self.lexical_scope = outer_scope;
        self.bytecode.emit_pop_environment();
    }
}
