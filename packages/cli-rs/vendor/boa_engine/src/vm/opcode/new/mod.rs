use super::IndexOperand;
use crate::{Context, JsExpect, JsResult, error::JsNativeError, vm::opcode::Operation};

/// `New` implements the Opcode Operation for `Opcode::New`
///
/// Operation:
///  - Call construct on a function.
#[derive(Debug, Clone, Copy)]
pub(crate) struct New;

impl New {
    #[inline(always)]
    pub(super) fn operation(argument_count: IndexOperand, context: &mut Context) -> JsResult<()> {
        let func = context
            .vm
            .stack
            .calling_convention_get_function(argument_count.into());

        let cons = func
            .as_object()
            .filter(crate::JsObject::is_constructor)
            .ok_or_else(|| crate::v8_messages::not_constructor(context, &func))?
            .clone();

        context.vm.stack.push(cons.clone()); // Push new.target

        cons.__construct__(argument_count.into()).resolve(context)?;
        Ok(())
    }
}

impl Operation for New {
    const NAME: &'static str = "New";
    const INSTRUCTION: &'static str = "INST - New";
    const COST: u8 = 3;
}

/// `NewSpread` implements the Opcode Operation for `Opcode::NewSpread`
///
/// Operation:
///  - Call construct on a function where the arguments contain spreads.
#[derive(Debug, Clone, Copy)]
pub(crate) struct NewSpread;

impl NewSpread {
    #[inline(always)]
    pub(super) fn operation((): (), context: &mut Context) -> JsResult<()> {
        // Get the arguments that are stored as an array object on the stack.
        let arguments_array = context.vm.stack.pop();
        let arguments_array_object = arguments_array
            .as_object()
            .js_expect("arguments array in call spread function must be an object")?;
        let arguments = arguments_array_object
            .borrow()
            .properties()
            .to_dense_indexed_properties()
            .js_expect("arguments array in call spread function must be dense")?;

        let func = context.vm.stack.pop();

        let cons = func
            .as_object()
            .filter(crate::JsObject::is_constructor)
            .ok_or_else(|| crate::v8_messages::not_constructor(context, &func))?
            .clone();

        let argument_count = arguments.len();
        context.vm.stack.push(func);
        context
            .vm
            .stack
            .calling_convention_push_arguments(&arguments);
        context.vm.stack.push(cons.clone()); // Push new.target

        cons.__construct__(argument_count).resolve(context)?;
        Ok(())
    }
}

impl Operation for NewSpread {
    const NAME: &'static str = "NewSpread";
    const INSTRUCTION: &'static str = "INST - NewSpread";
    const COST: u8 = 3;
}
