use crate::{
    Context,
    builtins::OrdinaryObject,
    vm::opcode::{Operation, RegisterOperand},
};

/// `StoreEmptyObject` implements the Opcode Operation for `Opcode::StoreEmptyObject`
///
/// Operation:
///  - Store empty object `{}` in dst.
#[derive(Debug, Clone, Copy)]
pub(crate) struct StoreEmptyObject;

impl StoreEmptyObject {
    #[inline(always)]
    pub(crate) fn operation(dst: RegisterOperand, context: &mut Context) {
        let o = context
            .intrinsics()
            .templates()
            .ordinary_object()
            .create(OrdinaryObject, Vec::default());
        context.vm.set_register(dst.into(), o.into());
    }
}

impl Operation for StoreEmptyObject {
    const NAME: &'static str = "StoreEmptyObject";
    const INSTRUCTION: &'static str = "INST - StoreEmptyObject";
    const COST: u8 = 1;
}
