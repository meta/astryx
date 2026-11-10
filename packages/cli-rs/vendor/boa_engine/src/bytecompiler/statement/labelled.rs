use crate::bytecompiler::{ByteCompiler, NodeKind};
use boa_ast::{
    Statement,
    statement::{Labelled, LabelledItem},
};

impl ByteCompiler<'_> {
    /// Compile a [`Labelled`] `boa_ast` node
    pub(crate) fn compile_labelled(&mut self, labelled: &Labelled, use_expr: bool) {
        let labelled_loc = self.next_opcode_location();
        self.push_labelled_control_info(labelled.label(), labelled_loc, use_expr);

        match labelled.item() {
            LabelledItem::Statement(stmt) => match stmt {
                Statement::ForLoop(for_loop) => {
                    self.compile_for_loop(for_loop, Some(labelled.label()), use_expr);
                }
                Statement::ForInLoop(for_in_loop) => {
                    self.compile_for_in_loop(for_in_loop, Some(labelled.label()), use_expr);
                }
                Statement::ForOfLoop(for_of_loop) => {
                    self.compile_for_of_loop(for_of_loop, Some(labelled.label()), use_expr);
                }
                Statement::WhileLoop(while_loop) => {
                    self.compile_while_loop(while_loop, Some(labelled.label()), use_expr);
                }
                Statement::DoWhileLoop(do_while_loop) => {
                    self.compile_do_while_loop(do_while_loop, Some(labelled.label()), use_expr);
                }
                stmt => self.compile_stmt(stmt, use_expr, true),
            },
            LabelledItem::FunctionDeclaration(f) => {
                let dst = self.register_allocator.alloc();
                self.function_with_binding(f.into(), NodeKind::Declaration, &dst);
                self.register_allocator.dealloc(dst);
            }
        }

        self.pop_labelled_control_info();
    }
}
