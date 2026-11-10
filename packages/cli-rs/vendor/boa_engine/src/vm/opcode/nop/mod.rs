use crate::{Context, vm::opcode::Operation};

/// `Reserved` implements the Opcode Operation for `Opcode::Reserved`
///
/// Operation:
///  - Panics, this should be unreachable.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Reserved;

impl Reserved {
    #[inline(always)]
    pub(crate) fn operation((): (), _: &mut Context) {
        unreachable!("Reserved opcodes are unreachable!")
    }
}

impl Operation for Reserved {
    const NAME: &'static str = "Reserved";
    const INSTRUCTION: &'static str = "INST - Reserved";
    const COST: u8 = 0;
}
