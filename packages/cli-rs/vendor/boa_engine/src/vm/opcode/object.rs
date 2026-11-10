use crate::{
    Context, JsExpect, JsResult, JsValue,
    object::internal_methods::InternalMethodPropertyContext,
    vm::opcode::{Operation, RegisterOperand},
};

/// `SetPrototype` implements the Opcode Operation for `Opcode::SetPrototype`
///
/// Operation:
///  - Sets the prototype of an object.
#[derive(Debug, Clone, Copy)]
pub(crate) struct SetPrototype;

impl SetPrototype {
    #[inline(always)]
    pub(crate) fn operation(
        (object, value): (RegisterOperand, RegisterOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let object = context.vm.get_register(object.into()).clone();
        let value = context.vm.get_register(value.into());

        let prototype = if let Some(prototype) = value.as_object() {
            Some(prototype.clone())
        } else if value.is_null() {
            None
        } else {
            return Ok(());
        };

        let object = object.as_object().js_expect("object is not an object")?;
        object
            .__set_prototype_of__(prototype, &mut InternalMethodPropertyContext::new(context))
            .js_expect("cannot fail per spec")?;

        Ok(())
    }
}

impl Operation for SetPrototype {
    const NAME: &'static str = "SetPrototype";
    const INSTRUCTION: &'static str = "INST - SetPrototype";
    const COST: u8 = 4;
}

/// `GetPrototype` implements the Opcode Operation for `Opcode::GetPrototype`
///
/// Operation:
///  - Gets the prototype of an object.
#[derive(Debug, Clone, Copy)]
pub(crate) struct GetPrototype;

impl GetPrototype {
    #[inline(always)]
    pub(crate) fn operation(object: RegisterOperand, context: &mut Context) -> JsResult<()> {
        let object_val = context
            .vm
            .get_register(object.into())
            .as_object()
            .js_expect("object register is not an object")?;

        let proto_object = object_val
            .__get_prototype_of__(context)?
            .map_or_else(JsValue::null, JsValue::from);

        context.vm.set_register(object.into(), proto_object);
        Ok(())
    }
}

impl Operation for GetPrototype {
    const NAME: &'static str = "GetPrototype";
    const INSTRUCTION: &'static str = "INST - GetPrototype";
    const COST: u8 = 4;
}
