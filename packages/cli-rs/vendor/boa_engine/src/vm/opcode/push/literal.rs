use crate::{
    Context, JsResult, JsValue,
    object::JsRegExp,
    vm::{
        Constant,
        opcode::{IndexOperand, Operation, RegisterOperand},
    },
};

/// `StoreLiteral` implements the Opcode Operation for `Opcode::StoreLiteral`
///
/// Operation:
///  - Store literal value in dst.
#[derive(Debug, Clone, Copy)]
pub(crate) struct StoreLiteral;

impl StoreLiteral {
    #[inline(always)]
    pub(crate) fn operation((dst, index): (RegisterOperand, IndexOperand), context: &mut Context) {
        let constant = &context.vm.frame().code_block().constants[usize::from(index)];
        let value: JsValue = match constant {
            Constant::BigInt(v) => v.clone().into(),
            Constant::String(v) => v.clone().into(),
            _ => unreachable!("constant should be a string or bigint"),
        };
        context.vm.set_register(dst.into(), value);
    }
}

impl Operation for StoreLiteral {
    const NAME: &'static str = "StoreLiteral";
    const INSTRUCTION: &'static str = "INST - StoreLiteral";
    const COST: u8 = 1;
}

/// `StoreRegexp` implements the Opcode Operation for `Opcode::StoreRegexp`
///
/// Operation:
///  - Store regexp value in dst.
#[derive(Debug, Clone, Copy)]
pub(crate) struct StoreRegexp;

impl StoreRegexp {
    #[inline(always)]
    pub(crate) fn operation(
        (dst, pattern_index, flags_index): (RegisterOperand, IndexOperand, IndexOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let code_block = context.vm.frame().code_block();
        let pattern = code_block.constant_string(pattern_index.into());
        let flags = code_block.constant_string(flags_index.into());
        let regexp = JsRegExp::new(pattern, flags, context)?;
        context.vm.set_register(dst.into(), regexp.into());
        Ok(())
    }
}

impl Operation for StoreRegexp {
    const NAME: &'static str = "StoreRegexp";
    const INSTRUCTION: &'static str = "INST - StoreRegexp";
    const COST: u8 = 5;
}
