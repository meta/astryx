use crate::{
    Context, JsResult,
    vm::opcode::{IndexOperand, Operation, RegisterOperand},
};

/// `GetPrivateField` implements the Opcode Operation for `Opcode::GetPrivateField`
///
/// Operation:
///  - Get a private property by name from an object and store it in dst.
#[derive(Debug, Clone, Copy)]
pub(crate) struct GetPrivateField;

impl GetPrivateField {
    #[inline(always)]
    pub(crate) fn operation(
        (dst, object, index): (RegisterOperand, RegisterOperand, IndexOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let name = context
            .vm
            .frame()
            .code_block()
            .constant_string(index.into());
        let object = context.vm.get_register(object.into()).clone();
        let object = object.to_object(context)?;
        let name = context
            .vm
            .frame()
            .environments
            .resolve_private_identifier(name)
            .expect("private name must be in environment");

        let result = object.private_get(&name, context)?;
        context.vm.set_register(dst.into(), result);
        Ok(())
    }
}

impl Operation for GetPrivateField {
    const NAME: &'static str = "GetPrivateField";
    const INSTRUCTION: &'static str = "INST - GetPrivateField";
    const COST: u8 = 4;
}
