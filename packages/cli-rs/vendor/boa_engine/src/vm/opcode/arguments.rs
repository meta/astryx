use super::{Operation, RegisterOperand};
use crate::{
    Context,
    builtins::function::arguments::{MappedArguments, UnmappedArguments},
};

/// `CreateMappedArgumentsObject` implements the Opcode Operation for `Opcode::CreateMappedArgumentsObject`
///
/// Operation:
///  - Create a mapped arguments object and store it in a register.
#[derive(Debug, Clone, Copy)]
pub(crate) struct CreateMappedArgumentsObject;

impl CreateMappedArgumentsObject {
    #[inline(always)]
    pub(super) fn operation(value: RegisterOperand, context: &mut Context) {
        let frame = context.vm.frame();
        let function_object = context
            .vm
            .stack
            .get_function(context.vm.frame())
            .expect("there should be a function object");
        let code = frame.code_block().clone();
        let args = context.vm.stack.get_arguments(context.vm.frame());
        let env = {
            let frame = context.vm.frame();
            frame
                .environments
                .current_declarative_ref(frame.realm.environment())
                .expect("must be declarative")
                .clone()
        };
        let arguments = MappedArguments::new(
            &function_object,
            &code.mapped_arguments_binding_indices,
            args,
            &env,
            context,
        );
        context.vm.set_register(value.into(), arguments.into());
    }
}

impl Operation for CreateMappedArgumentsObject {
    const NAME: &'static str = "CreateMappedArgumentsObject";
    const INSTRUCTION: &'static str = "INST - CreateMappedArgumentsObject";
    const COST: u8 = 8;
}

/// `CreateUnmappedArgumentsObject` implements the Opcode Operation for `Opcode::CreateUnmappedArgumentsObject`
///
/// Operation:
///  - Create an unmapped arguments object and store it in a register.
#[derive(Debug, Clone, Copy)]
pub(crate) struct CreateUnmappedArgumentsObject;

impl CreateUnmappedArgumentsObject {
    #[inline(always)]
    pub(super) fn operation(dst: RegisterOperand, context: &mut Context) {
        let args = context.vm.stack.get_arguments(context.vm.frame()).to_vec();
        let arguments = UnmappedArguments::new(&args, context);
        context.vm.set_register(dst.into(), arguments.into());
    }
}

impl Operation for CreateUnmappedArgumentsObject {
    const NAME: &'static str = "CreateUnmappedArgumentsObject";
    const INSTRUCTION: &'static str = "INST - CreateUnmappedArgumentsObject";
    const COST: u8 = 4;
}
