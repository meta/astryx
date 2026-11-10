use super::RegisterOperand;
use crate::{Context, JsResult, vm::opcode::Operation};
use thin_vec::ThinVec;

/// `CopyDataProperties` implements the Opcode Operation for `Opcode::CopyDataProperties`
///
/// Operation:
///  - Copy all properties of one object to another object.
#[derive(Debug, Clone, Copy)]
pub(crate) struct CopyDataProperties;

impl CopyDataProperties {
    #[inline(always)]
    pub(super) fn operation(
        (object, source, keys): (RegisterOperand, RegisterOperand, ThinVec<RegisterOperand>),
        context: &mut Context,
    ) -> JsResult<()> {
        let object = context.vm.get_register(object.into()).clone();
        let source = context.vm.get_register(source.into()).clone();
        let mut excluded_keys = Vec::with_capacity(keys.len());
        for key in keys {
            let key = context.vm.get_register(key.into()).clone();
            excluded_keys.push(
                key.to_property_key(context)
                    .expect("key must be property key"),
            );
        }
        let object = object.as_object().expect("not an object");
        object.copy_data_properties(&source, excluded_keys, context)?;
        Ok(())
    }
}

impl Operation for CopyDataProperties {
    const NAME: &'static str = "CopyDataProperties";
    const INSTRUCTION: &'static str = "INST - CopyDataProperties";
    const COST: u8 = 6;
}
