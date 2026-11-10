use crate::{
    Context,
    vm::{
        code_block::create_function_object_fast,
        opcode::{IndexOperand, Operation, RegisterOperand},
    },
};

/// `GetFunction` implements the Opcode Operation for `Opcode::GetFunction`
///
/// Operation:
///  - Get function from the pre-compiled inner functions.
#[derive(Debug, Clone, Copy)]
pub(crate) struct GetFunction;

impl GetFunction {
    #[inline(always)]
    pub(crate) fn operation((dst, index): (RegisterOperand, IndexOperand), context: &mut Context) {
        let code = context
            .vm
            .frame()
            .code_block()
            .constant_function(index.into());
        let function = create_function_object_fast(code, context);
        context.vm.set_register(dst.into(), function.into());
    }
}

impl Operation for GetFunction {
    const NAME: &'static str = "GetFunction";
    const INSTRUCTION: &'static str = "INST - GetFunction";
    const COST: u8 = 3;
}
