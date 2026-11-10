use crate::{
    Context, JsBigInt, JsResult,
    value::{JsValue, JsVariant, Numeric},
    vm::opcode::{Operation, RegisterOperand},
};

/// `Dec` implements the Opcode Operation for `Opcode::Dec`
///
/// Operation:
///  - Unary `--` operator.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Dec;

impl Dec {
    #[inline(always)]
    pub(crate) fn operation(
        (dst, src): (RegisterOperand, RegisterOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let value = context.vm.take_register(src.into());

        let (numeric, value) = match value.variant() {
            JsVariant::Integer32(number) if number > i32::MIN => {
                (JsValue::from(number), JsValue::from(number - 1))
            }
            _ => match value.to_numeric(context)? {
                Numeric::Number(number) => (JsValue::from(number), JsValue::from(number - 1f64)),
                Numeric::BigInt(bigint) => (
                    JsValue::from(bigint.clone()),
                    JsValue::from(JsBigInt::sub(&bigint, &JsBigInt::one())),
                ),
            },
        };
        context.vm.set_register(src.into(), numeric);
        context.vm.set_register(dst.into(), value);
        Ok(())
    }
}

impl Operation for Dec {
    const NAME: &'static str = "Dec";
    const INSTRUCTION: &'static str = "INST - Dec";
    const COST: u8 = 3;
}
