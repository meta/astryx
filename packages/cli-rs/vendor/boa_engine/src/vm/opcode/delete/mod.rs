use crate::{
    Context, JsError, JsResult, error::JsNativeError,
    object::internal_methods::InternalMethodPropertyContext, vm::opcode::Operation,
};

use super::{IndexOperand, RegisterOperand};

/// `DeletePropertyByName` implements the Opcode Operation for `Opcode::DeletePropertyByName`
///
/// Operation:
///  - Deletes a property by name of an object
#[derive(Debug, Clone, Copy)]
pub(crate) struct DeletePropertyByName;

impl DeletePropertyByName {
    #[inline(always)]
    pub(super) fn operation(
        (object_register, index): (RegisterOperand, IndexOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let object = context.vm.take_register(object_register.into());
        let object = object.to_object(context)?;
        let code_block = context.vm.frame().code_block();
        let key = code_block.constant_string(index.into()).into();
        let strict = code_block.strict();

        let result = object.__delete__(&key, &mut InternalMethodPropertyContext::new(context))?;
        if !result && strict {
            return Err(JsNativeError::typ()
                .with_message("Cannot delete property")
                .into());
        }
        context
            .vm
            .set_register(object_register.into(), result.into());
        Ok(())
    }
}

impl Operation for DeletePropertyByName {
    const NAME: &'static str = "DeletePropertyByName";
    const INSTRUCTION: &'static str = "INST - DeletePropertyByName";
    const COST: u8 = 3;
}

/// `DeletePropertyByValue` implements the Opcode Operation for `Opcode::DeletePropertyByValue`
///
/// Operation:
///  - Deletes a property by value of an object
#[derive(Debug, Clone, Copy)]
pub(crate) struct DeletePropertyByValue;

impl DeletePropertyByValue {
    #[inline(always)]
    pub(super) fn operation(
        (object_register, key): (RegisterOperand, RegisterOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let object = context.vm.get_register(object_register.into()).clone();
        let key = context.vm.get_register(key.into()).clone();
        let object = object.to_object(context)?;
        let property_key = key.to_property_key(context)?;

        let result = object.__delete__(
            &property_key,
            &mut InternalMethodPropertyContext::new(context),
        )?;
        if !result && context.vm.frame().code_block().strict() {
            return Err(JsNativeError::typ()
                .with_message("Cannot delete property")
                .into());
        }
        context
            .vm
            .set_register(object_register.into(), result.into());
        Ok(())
    }
}

impl Operation for DeletePropertyByValue {
    const NAME: &'static str = "DeletePropertyByValue";
    const INSTRUCTION: &'static str = "INST - DeletePropertyByValue";
    const COST: u8 = 3;
}

/// `DeleteName` implements the Opcode Operation for `Opcode::DeleteName`
///
/// Operation:
///  - Deletes a property by value of an object
#[derive(Debug, Clone, Copy)]
pub(crate) struct DeleteName;

impl DeleteName {
    #[inline(always)]
    pub(super) fn operation(
        (value, index): (RegisterOperand, IndexOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let mut binding_locator =
            context.vm.frame().code_block.bindings[usize::from(index)].clone();
        context.find_runtime_binding(&mut binding_locator)?;
        let deleted = context.delete_binding(&binding_locator)?;
        context.vm.set_register(value.into(), deleted.into());
        Ok(())
    }
}

impl Operation for DeleteName {
    const NAME: &'static str = "DeleteName";
    const INSTRUCTION: &'static str = "INST - DeleteName";
    const COST: u8 = 3;
}

/// `DeleteSuperThrow` implements the Opcode Operation for `Opcode::DeleteSuperThrow`
///
/// Operation:
///  - Throws an error when trying to delete a property of `super`.
#[derive(Debug, Clone, Copy)]
pub(crate) struct DeleteSuperThrow;

impl DeleteSuperThrow {
    #[inline(always)]
    pub(super) fn operation((): (), _: &mut Context) -> JsError {
        JsNativeError::reference()
            .with_message("cannot delete a property of `super`")
            .into()
    }
}

impl Operation for DeleteSuperThrow {
    const NAME: &'static str = "DeleteSuperThrow";
    const INSTRUCTION: &'static str = "INST - DeleteSuperThrow";
    const COST: u8 = 2;
}
