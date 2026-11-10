use super::RegisterOperand;
use crate::{Context, JsResult, error::JsNativeError, vm::opcode::Operation};

/// `ValueNotNullOrUndefined` implements the Opcode Operation for `Opcode::ValueNotNullOrUndefined`
///
/// Operation:
///  - Require the stack value to be neither null nor undefined.
#[derive(Debug, Clone, Copy)]
pub(crate) struct ValueNotNullOrUndefined;

impl ValueNotNullOrUndefined {
    #[inline(always)]
    pub(super) fn operation(value: RegisterOperand, context: &mut Context) -> JsResult<()> {
        let value = context.vm.get_register(value.into()).clone();
        if value.is_null_or_undefined() {
            let msg = crate::v8_messages::at_pc(context, 'D', &value).unwrap_or_else(|| {
                let w = if value.is_null() { "null" } else { "undefined" };
                format!("Cannot destructure '{w}' as it is {w}.")
            });
            return Err(JsNativeError::typ().with_message(msg).into());
        }
        Ok(())
    }
}

impl Operation for ValueNotNullOrUndefined {
    const NAME: &'static str = "ValueNotNullOrUndefined";
    const INSTRUCTION: &'static str = "INST - ValueNotNullOrUndefined";
    const COST: u8 = 2;
}

/// `IsObject` implements the Opcode Operation for `Opcode::IsObject`
///
/// Operation:
///  - Store `true` in the register if the value is an object, or `false` otherwise.
#[derive(Debug, Clone, Copy)]
pub(crate) struct IsObject;

impl IsObject {
    #[inline(always)]
    pub(super) fn operation(value: RegisterOperand, context: &mut Context) {
        let is_object = context.vm.get_register(value.into()).is_object();
        context.vm.set_register(value.into(), is_object.into());
    }
}

impl Operation for IsObject {
    const NAME: &'static str = "IsObject";
    const INSTRUCTION: &'static str = "INST - IsObject";
    const COST: u8 = 1;
}
