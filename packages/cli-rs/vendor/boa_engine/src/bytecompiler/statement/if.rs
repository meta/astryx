use crate::bytecompiler::ByteCompiler;
use boa_ast::statement::If;

impl ByteCompiler<'_> {
    pub(crate) fn compile_if(&mut self, node: &If, use_expr: bool) {
        self.compile_if_else(
            node.cond(),
            |compiler| {
                compiler.compile_stmt(node.body(), use_expr, true);
            },
            |compiler| {
                if let Some(else_body) = node.else_node() {
                    compiler.compile_stmt(else_body, use_expr, true);
                }
            },
        );
    }
}
