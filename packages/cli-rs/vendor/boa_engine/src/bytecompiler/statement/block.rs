use crate::bytecompiler::ByteCompiler;
use boa_ast::statement::Block;

impl ByteCompiler<'_> {
    /// Compile a [`Block`] `boa_ast` node
    pub(crate) fn compile_block(&mut self, block: &Block, use_expr: bool) {
        let scope = self.push_declarative_scope(block.scope());
        self.block_declaration_instantiation(block);
        self.compile_statement_list(block.statement_list(), use_expr, true);
        self.pop_declarative_scope(scope);
    }
}
