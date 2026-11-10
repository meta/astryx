use super::RegisterOperand;
use crate::{Context, JsBigInt, JsResult, builtins::Number, value::Numeric, vm::opcode::Operation};
use std::ops::Neg as StdNeg;

pub(crate) mod decrement;
pub(crate) mod increment;
pub(crate) mod logical;

pub(crate) use decrement::*;
pub(crate) use increment::*;
pub(crate) use logical::*;

/// `TypeOf` implements the Opcode Operation for `Opcode::TypeOf`
///
/// Operation:
///  - Unary `typeof` operator.
#[derive(Debug, Clone, Copy)]
pub(crate) struct TypeOf;

impl TypeOf {
    #[inline(always)]
    pub(super) fn operation(value: RegisterOperand, context: &mut Context) {
        context.vm.set_register(
            value.into(),
            context.vm.get_register(value.into()).js_type_of().into(),
        );
    }
}

impl Operation for TypeOf {
    const NAME: &'static str = "TypeOf";
    const INSTRUCTION: &'static str = "INST - TypeOf";
    const COST: u8 = 1;
}

/// `Pos` implements the Opcode Operation for `Opcode::Pos`
///
/// Operation:
///  - Unary `+` operator.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Pos;

impl Pos {
    #[inline(always)]
    pub(super) fn operation(value: RegisterOperand, context: &mut Context) -> JsResult<()> {
        let v = context
            .vm
            .get_register(value.into())
            .clone()
            .to_number(context)?
            .into();
        context.vm.set_register(value.into(), v);
        Ok(())
    }
}

impl Operation for Pos {
    const NAME: &'static str = "Pos";
    const INSTRUCTION: &'static str = "INST - Pos";
    const COST: u8 = 3;
}

/// `Neg` implements the Opcode Operation for `Opcode::Neg`
///
/// Operation:
///  - Unary `-` operator.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Neg;

impl Neg {
    #[inline(always)]
    pub(super) fn operation(value: RegisterOperand, context: &mut Context) -> JsResult<()> {
        match context
            .vm
            .get_register(value.into())
            .clone()
            .to_numeric(context)?
        {
            Numeric::Number(number) => context.vm.set_register(value.into(), number.neg().into()),
            Numeric::BigInt(bigint) => context
                .vm
                .set_register(value.into(), JsBigInt::neg(&bigint).into()),
        }
        Ok(())
    }
}

impl Operation for Neg {
    const NAME: &'static str = "Neg";
    const INSTRUCTION: &'static str = "INST - Neg";
    const COST: u8 = 3;
}

/// `BitNot` implements the Opcode Operation for `Opcode::BitNot`
///
/// Operation:
///  - Unary bitwise `~` operator.
#[derive(Debug, Clone, Copy)]
pub(crate) struct BitNot;

impl BitNot {
    #[inline(always)]
    pub(super) fn operation(value: RegisterOperand, context: &mut Context) -> JsResult<()> {
        match context
            .vm
            .get_register(value.into())
            .clone()
            .to_numeric(context)?
        {
            Numeric::Number(number) => context
                .vm
                .set_register(value.into(), Number::not(number).into()),
            Numeric::BigInt(bigint) => context
                .vm
                .set_register(value.into(), JsBigInt::not(&bigint).into()),
        }
        Ok(())
    }
}

impl Operation for BitNot {
    const NAME: &'static str = "BitNot";
    const INSTRUCTION: &'static str = "INST - BitNot";
    const COST: u8 = 3;
}
