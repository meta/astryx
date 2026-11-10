use crate::{
    Context, JsResult,
    vm::opcode::{Address, Operation, RegisterOperand},
};
use thin_vec::ThinVec;

/// `Jump` implements the Opcode Operation for `Opcode::Jump`
///
/// Operation:
///  - Unconditional jump to address.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Jump;

impl Jump {
    #[inline(always)]
    pub(crate) fn operation(address: Address, context: &mut Context) {
        context.vm.frame_mut().pc = u32::from(address);
    }
}

impl Operation for Jump {
    const NAME: &'static str = "Jump";
    const INSTRUCTION: &'static str = "INST - Jump";
    const COST: u8 = 1;
}

// `JumpIfTrue` implements the Opcode Operation for `Opcode::JumpIfTrue`
///
/// Operation:
///  - Conditional jump to address.
#[derive(Debug, Clone, Copy)]
pub(crate) struct JumpIfTrue;

impl JumpIfTrue {
    #[inline(always)]
    pub(crate) fn operation((address, value): (Address, RegisterOperand), context: &mut Context) {
        let value = context.vm.get_register(value.into());
        if value.to_boolean() {
            context.vm.frame_mut().pc = u32::from(address);
        }
    }
}

impl Operation for JumpIfTrue {
    const NAME: &'static str = "JumpIfTrue";
    const INSTRUCTION: &'static str = "INST - JumpIfTrue";
    const COST: u8 = 1;
}

/// `JumpIfFalse` implements the Opcode Operation for `Opcode::JumpIfFalse`
///
/// Operation:
///  - Conditional jump to address.
#[derive(Debug, Clone, Copy)]
pub(crate) struct JumpIfFalse;

impl JumpIfFalse {
    #[inline(always)]
    pub(crate) fn operation((address, value): (Address, RegisterOperand), context: &mut Context) {
        let value = context.vm.get_register(value.into());
        if !value.to_boolean() {
            context.vm.frame_mut().pc = u32::from(address);
        }
    }
}

impl Operation for JumpIfFalse {
    const NAME: &'static str = "JumpIfFalse";
    const INSTRUCTION: &'static str = "INST - JumpIfFalse";
    const COST: u8 = 1;
}

/// `JumpIfNotUndefined` implements the Opcode Operation for `Opcode::JumpIfNotUndefined`
///
/// Operation:
///  - Conditional jump to address.
#[derive(Debug, Clone, Copy)]
pub(crate) struct JumpIfNotUndefined;

impl JumpIfNotUndefined {
    #[inline(always)]
    pub(crate) fn operation((address, value): (Address, RegisterOperand), context: &mut Context) {
        let value = context.vm.get_register(value.into());
        if !value.is_undefined() {
            context.vm.frame_mut().pc = u32::from(address);
        }
    }
}

impl Operation for JumpIfNotUndefined {
    const NAME: &'static str = "JumpIfNotUndefined";
    const INSTRUCTION: &'static str = "INST - JumpIfNotUndefined";
    const COST: u8 = 1;
}

/// `JumpIfNullOrUndefined` implements the Opcode Operation for `Opcode::JumpIfNullOrUndefined`
///
/// Operation:
///  - Conditional jump to address.
#[derive(Debug, Clone, Copy)]
pub(crate) struct JumpIfNullOrUndefined;

impl JumpIfNullOrUndefined {
    #[inline(always)]
    pub(crate) fn operation((address, value): (Address, RegisterOperand), context: &mut Context) {
        let value = context.vm.get_register(value.into());
        if value.is_null_or_undefined() {
            context.vm.frame_mut().pc = u32::from(address);
        }
    }
}

impl Operation for JumpIfNullOrUndefined {
    const NAME: &'static str = "JumpIfNullOrUndefined";
    const INSTRUCTION: &'static str = "INST - JumpIfNullOrUndefined";
    const COST: u8 = 1;
}

/// `JumpIfNotLessThan` implements the Opcode Operation for `Opcode::JumpIfNotLessThan`
///
/// Operation:
///  - Fused `<` comparison + conditional jump. Jumps if `!(lhs < rhs)`.
#[derive(Debug, Clone, Copy)]
pub(crate) struct JumpIfNotLessThan;

impl JumpIfNotLessThan {
    #[inline(always)]
    pub(crate) fn operation(
        (address, lhs, rhs): (Address, RegisterOperand, RegisterOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let lhs = context.vm.get_register(lhs.into());
        let rhs = context.vm.get_register(rhs.into());
        if let Some(result) = lhs.lt_fast(rhs) {
            if !result {
                context.vm.frame_mut().pc = u32::from(address);
            }
            return Ok(());
        }
        let lhs = lhs.clone();
        let rhs = rhs.clone();
        if !lhs.lt(&rhs, context)? {
            context.vm.frame_mut().pc = u32::from(address);
        }
        Ok(())
    }
}

impl Operation for JumpIfNotLessThan {
    const NAME: &'static str = "JumpIfNotLessThan";
    const INSTRUCTION: &'static str = "INST - JumpIfNotLessThan";
    const COST: u8 = 2;
}

/// `JumpIfNotLessThanOrEqual` implements the Opcode Operation for `Opcode::JumpIfNotLessThanOrEqual`
///
/// Operation:
///  - Fused `<=` comparison + conditional jump. Jumps if `!(lhs <= rhs)`.
#[derive(Debug, Clone, Copy)]
pub(crate) struct JumpIfNotLessThanOrEqual;

impl JumpIfNotLessThanOrEqual {
    #[inline(always)]
    pub(crate) fn operation(
        (address, lhs, rhs): (Address, RegisterOperand, RegisterOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let lhs = context.vm.get_register(lhs.into());
        let rhs = context.vm.get_register(rhs.into());
        if let Some(result) = lhs.le_fast(rhs) {
            if !result {
                context.vm.frame_mut().pc = u32::from(address);
            }
            return Ok(());
        }
        let lhs = lhs.clone();
        let rhs = rhs.clone();
        if !lhs.le(&rhs, context)? {
            context.vm.frame_mut().pc = u32::from(address);
        }
        Ok(())
    }
}

impl Operation for JumpIfNotLessThanOrEqual {
    const NAME: &'static str = "JumpIfNotLessThanOrEqual";
    const INSTRUCTION: &'static str = "INST - JumpIfNotLessThanOrEqual";
    const COST: u8 = 2;
}

/// `JumpIfNotGreaterThan` implements the Opcode Operation for `Opcode::JumpIfNotGreaterThan`
///
/// Operation:
///  - Fused `>` comparison + conditional jump. Jumps if `!(lhs > rhs)`.
#[derive(Debug, Clone, Copy)]
pub(crate) struct JumpIfNotGreaterThan;

impl JumpIfNotGreaterThan {
    #[inline(always)]
    pub(crate) fn operation(
        (address, lhs, rhs): (Address, RegisterOperand, RegisterOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let lhs = context.vm.get_register(lhs.into());
        let rhs = context.vm.get_register(rhs.into());
        if let Some(result) = lhs.gt_fast(rhs) {
            if !result {
                context.vm.frame_mut().pc = u32::from(address);
            }
            return Ok(());
        }
        let lhs = lhs.clone();
        let rhs = rhs.clone();
        if !lhs.gt(&rhs, context)? {
            context.vm.frame_mut().pc = u32::from(address);
        }
        Ok(())
    }
}

impl Operation for JumpIfNotGreaterThan {
    const NAME: &'static str = "JumpIfNotGreaterThan";
    const INSTRUCTION: &'static str = "INST - JumpIfNotGreaterThan";
    const COST: u8 = 2;
}

/// `JumpIfNotGreaterThanOrEqual` implements the Opcode Operation for `Opcode::JumpIfNotGreaterThanOrEqual`
///
/// Operation:
///  - Fused `>=` comparison + conditional jump. Jumps if `!(lhs >= rhs)`.
#[derive(Debug, Clone, Copy)]
pub(crate) struct JumpIfNotGreaterThanOrEqual;

impl JumpIfNotGreaterThanOrEqual {
    #[inline(always)]
    pub(crate) fn operation(
        (address, lhs, rhs): (Address, RegisterOperand, RegisterOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let lhs = context.vm.get_register(lhs.into());
        let rhs = context.vm.get_register(rhs.into());
        if let Some(result) = lhs.ge_fast(rhs) {
            if !result {
                context.vm.frame_mut().pc = u32::from(address);
            }
            return Ok(());
        }
        let lhs = lhs.clone();
        let rhs = rhs.clone();
        if !lhs.ge(&rhs, context)? {
            context.vm.frame_mut().pc = u32::from(address);
        }
        Ok(())
    }
}

impl Operation for JumpIfNotGreaterThanOrEqual {
    const NAME: &'static str = "JumpIfNotGreaterThanOrEqual";
    const INSTRUCTION: &'static str = "INST - JumpIfNotGreaterThanOrEqual";
    const COST: u8 = 2;
}

/// `JumpIfNotEqual` implements the Opcode Operation for `Opcode::JumpIfNotEqual`
///
/// Operation:
///  - Conditional jump to address.
#[derive(Debug, Clone, Copy)]
pub(crate) struct JumpIfNotEqual;

impl JumpIfNotEqual {
    #[inline(always)]
    pub(crate) fn operation(
        (address, lhs, rhs): (Address, RegisterOperand, RegisterOperand),
        context: &mut Context,
    ) {
        let lhs = context.vm.get_register(lhs.into());
        let rhs = context.vm.get_register(rhs.into());
        if lhs != rhs {
            context.vm.frame_mut().pc = u32::from(address);
        }
    }
}

impl Operation for JumpIfNotEqual {
    const NAME: &'static str = "JumpIfNotEqual";
    const INSTRUCTION: &'static str = "INST - JumpIfNotEqual";
    const COST: u8 = 1;
}

/// `JumpTable` implements the Opcode Operation for `Opcode::JumpTable`
///
/// Operation:
///  - Conditional jump to address.
#[derive(Debug, Clone, Copy)]
pub(crate) struct JumpTable;

impl JumpTable {
    #[inline(always)]
    pub(crate) fn operation((index, addresses): (u32, ThinVec<Address>), context: &mut Context) {
        let value = context.vm.get_register(index as usize);
        let Some(offset) = value.as_i32().map(|i| i as usize) else {
            return;
        };

        let Some(pc) = addresses.get(offset).copied() else {
            return;
        };

        context.vm.frame_mut().pc = u32::from(pc);
    }
}

impl Operation for JumpTable {
    const NAME: &'static str = "JumpTable";
    const INSTRUCTION: &'static str = "INST - JumpTable";
    const COST: u8 = 5;
}
