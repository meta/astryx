use super::RegisterOperand;
use crate::{Context, JsResult, JsString, vm::opcode::Operation};
use thin_vec::ThinVec;

/// `ConcatToString` implements the Opcode Operation for `Opcode::ConcatToString`
///
/// Operation:
///  - Concat multiple stack objects into a string.
#[derive(Debug, Clone, Copy)]
pub(crate) struct ConcatToString;

impl ConcatToString {
    #[inline(always)]
    pub(super) fn operation(
        (string, values): (RegisterOperand, ThinVec<RegisterOperand>),

        context: &mut Context,
    ) -> JsResult<()> {
        let mut strings = Vec::with_capacity(values.len());
        for value in values {
            let val = context.vm.get_register(value.into()).clone();
            strings.push(val.to_string(context)?);
        }
        let s = JsString::concat_array(&strings.iter().map(JsString::as_str).collect::<Vec<_>>());
        context.vm.set_register(string.into(), s.into());
        Ok(())
    }
}

impl Operation for ConcatToString {
    const NAME: &'static str = "ConcatToString";
    const INSTRUCTION: &'static str = "INST - ConcatToString";
    const COST: u8 = 6;
}
