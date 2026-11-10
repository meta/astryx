use crate::bytecompiler::{
    ByteCompiler,
    jump_control::{JumpRecord, JumpRecordAction, JumpRecordKind},
};
use boa_ast::statement::Continue;

impl ByteCompiler<'_> {
    #[allow(clippy::unnecessary_wraps)]
    pub(crate) fn compile_continue(&mut self, node: Continue, _use_expr: bool) {
        let actions = self.continue_jump_record_actions(node);

        JumpRecord::new(JumpRecordKind::Continue, actions)
            .perform_actions(Self::DUMMY_ADDRESS, self);
    }

    fn continue_jump_record_actions(&self, node: Continue) -> Vec<JumpRecordAction> {
        let mut actions = Vec::default();
        for (i, info) in self.jump_info.iter().enumerate().rev() {
            let count = self.jump_info_open_environment_count(i);
            actions.push(JumpRecordAction::PopEnvironments { count });

            if !info.in_finally()
                && let Some((finally_throw_flag, finally_throw_index)) = info.finally_throw
            {
                actions.push(JumpRecordAction::HandleFinally {
                    index: info.jumps.len() as u32,
                    finally_throw_flag,
                    finally_throw_index,
                });
                actions.push(JumpRecordAction::Transfer { index: i as u32 });
            }

            if let Some(label) = node.label() {
                if info.label() == Some(label) {
                    actions.push(JumpRecordAction::Transfer { index: i as u32 });
                    break;
                }
            } else if info.is_loop() {
                actions.push(JumpRecordAction::Transfer { index: i as u32 });
                break;
            }

            if info.iterator_loop() {
                actions.push(JumpRecordAction::CloseIterator {
                    r#async: info.for_await_of_loop(),
                });
            }
        }

        actions.reverse();
        actions
    }
}
