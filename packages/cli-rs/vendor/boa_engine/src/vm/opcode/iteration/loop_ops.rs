use crate::error::RuntimeLimitError;
use crate::{Context, JsResult, vm::opcode::Operation};

/// `IncrementLoopIteration` implements the Opcode Operation for `Opcode::IncrementLoopIteration`.
///
/// Operation:
///  - Increment loop iteration count.
#[derive(Debug, Clone, Copy)]
pub(crate) struct IncrementLoopIteration;

impl IncrementLoopIteration {
    #[inline(always)]
    pub(crate) fn operation((): (), context: &mut Context) -> JsResult<()> {
        let max = context.vm.runtime_limits.loop_iteration_limit();
        let frame = context.vm.frame_mut();
        let previous_iteration_count = frame.loop_iteration_count;

        if previous_iteration_count > max {
            return Err(RuntimeLimitError::LoopIteration.into());
        }

        frame.loop_iteration_count = previous_iteration_count.wrapping_add(1);
        Ok(())
    }
}

impl Operation for IncrementLoopIteration {
    const NAME: &'static str = "IncrementLoopIteration";
    const INSTRUCTION: &'static str = "INST - IncrementLoopIteration";
    const COST: u8 = 3;
}
