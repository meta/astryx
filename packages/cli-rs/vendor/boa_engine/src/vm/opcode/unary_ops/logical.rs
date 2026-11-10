use crate::{
    Context,
    vm::opcode::{Operation, RegisterOperand},
};

/// `LogicalNot` implements the Opcode Operation for `Opcode::LogicalNot`
///
/// Operation:
///  - Unary logical `!` operator.
#[derive(Debug, Clone, Copy)]
pub(crate) struct LogicalNot;

impl LogicalNot {
    #[inline(always)]
    pub(crate) fn operation(value: RegisterOperand, context: &mut Context) {
        context.vm.set_register(
            value.into(),
            (!context.vm.get_register(value.into()).to_boolean()).into(),
        );
    }
}

impl Operation for LogicalNot {
    const NAME: &'static str = "LogicalNot";
    const INSTRUCTION: &'static str = "INST - LogicalNot";
    const COST: u8 = 1;
}
