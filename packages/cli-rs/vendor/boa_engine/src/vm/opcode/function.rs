use crate::{
    Context, JsExpect, JsResult, JsValue,
    builtins::function::OrdinaryFunction,
    vm::opcode::{IndexOperand, Operation, RegisterOperand},
};

/// `SetHomeObject` implements the Opcode Operation for `Opcode::SetHomeObject`
///
/// Operation:
///  - Set home object internal slot of a function object.
#[derive(Debug, Clone, Copy)]
pub(crate) struct SetHomeObject;

impl SetHomeObject {
    #[inline(always)]
    pub(crate) fn operation(
        (function, home): (RegisterOperand, RegisterOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let function = context.vm.get_register(function.into());
        let home = context.vm.get_register(home.into());

        function
            .as_object()
            .js_expect("must be object")?
            .downcast_mut::<OrdinaryFunction>()
            .js_expect("must be function object")?
            .set_home_object(home.as_object().js_expect("must be object")?.clone());

        Ok(())
    }
}

impl Operation for SetHomeObject {
    const NAME: &'static str = "SetHomeObject";
    const INSTRUCTION: &'static str = "INST - SetHomeObject";
    const COST: u8 = 4;
}

/// `GetHomeObject` implements the Opcode Operation for `Opcode::GetHomeObject`
///
/// Operation:
///  - Get the home object internal slot of a function object (null if not set).
///
/// Registers (in):
///  - `function`: `JsObject<OrdinaryFunction>`
///
/// Registers (out):
///  - `home`: `JsObject` or `null` if the home object is not set.
#[derive(Debug, Clone, Copy)]
pub(crate) struct GetHomeObject;

impl GetHomeObject {
    #[inline(always)]
    pub(crate) fn operation(function: RegisterOperand, context: &mut Context) -> JsResult<()> {
        let function_v = context.vm.get_register(function.into());

        let home_object = function_v
            .as_object()
            .js_expect("must be object")?
            .downcast_ref::<OrdinaryFunction>()
            .js_expect("must be function object")?
            .get_home_object()
            .map_or_else(JsValue::null, |o| o.clone().into());

        context.vm.set_register(function.into(), home_object);
        Ok(())
    }
}

impl Operation for GetHomeObject {
    const NAME: &'static str = "GetHomeObject";
    const INSTRUCTION: &'static str = "INST - GetHomeObject";
    const COST: u8 = 4;
}

/// `GetMethod` implements the Opcode Operation for `Opcode::GetMethod`
///
/// Operation:
///  - Get a method of an object (undefined if not in the object).
///
/// Operands:
///  - name_index: constant `JsString`
///
/// Registers (inout)
///  - object: `JsObject`, and the operation will set it to the method or
///    to `undefined` if the object does not have the specified name.
#[derive(Debug, Clone, Copy)]
pub(crate) struct GetMethod;

impl GetMethod {
    #[inline(always)]
    pub(crate) fn operation(
        (object, name_index): (RegisterOperand, IndexOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let function_val = context.vm.take_register(object.into());
        let code_block = context.vm.frame().code_block();
        let key = code_block.constant_string(name_index.into());

        let method = function_val.get_method(key, context)?;

        context.vm.set_register(
            object.into(),
            method.map_or_else(JsValue::undefined, JsValue::from),
        );

        Ok(())
    }
}

impl Operation for GetMethod {
    const NAME: &'static str = "GetMethod";
    const INSTRUCTION: &'static str = "INST - GetMethod";
    const COST: u8 = 3;
}
