use crate::{
    Context, JsResult, JsValue,
    vm::opcode::{Operation, RegisterOperand},
};

macro_rules! implement_bin_ops {
    ($name:ident, $op:ident, $doc_string:literal $(, $fast_fn: ident)?) => {
        #[doc= concat!("`", stringify!($name), "` implements the `OpCode` Operation for `Opcode::", stringify!($name), "`\n")]
        #[doc= "\n"]
        #[doc="Operation:\n"]
        #[doc= concat!(" - ", $doc_string)]
        #[derive(Debug, Clone, Copy)]
        pub(crate) struct $name;

        impl $name {
            #[inline]
            pub(crate) fn operation(
                (dst, lhs, rhs): (RegisterOperand, RegisterOperand, RegisterOperand),
                context: &mut Context,
            ) -> JsResult<()> {
                let lhs = context.vm.get_register(lhs.into());
                let rhs = context.vm.get_register(rhs.into());

                $(
                // Fast path: try numeric operation without cloning.
                if let Some(value) = JsValue::$fast_fn(lhs, rhs) {
                    context.vm.set_register(dst.into(), value.into());
                    return Ok(());
                }
                )?

                // Slow path: clone and use full method with type coercion.
                let lhs = lhs.clone();
                let rhs = rhs.clone();
                let value = lhs.$op(&rhs, context)?;
                context.vm.set_register(dst.into(), value.into());
                Ok(())
            }
        }

        impl Operation for $name {
            const NAME: &'static str = stringify!($name);
            const INSTRUCTION: &'static str = stringify!("INST - " + $name);
            const COST: u8 = 2;
        }
    };
}

implement_bin_ops!(Add, add, "Binary `+` operator.", add_fast);
implement_bin_ops!(Sub, sub, "Binary `-` operator.", sub_fast);
implement_bin_ops!(Mul, mul, "Binary `*` operator.", mul_fast);
implement_bin_ops!(Div, div, "Binary `/` operator.", div_fast);
implement_bin_ops!(Pow, pow, "Binary `**` operator.", pow_fast);
implement_bin_ops!(Mod, rem, "Binary `%` operator.", rem_fast);
implement_bin_ops!(BitAnd, bitand, "Binary `&` operator.", bitand_fast);
implement_bin_ops!(BitOr, bitor, "Binary `|` operator.", bitor_fast);
implement_bin_ops!(BitXor, bitxor, "Binary `^` operator.", bitxor_fast);
implement_bin_ops!(ShiftLeft, shl, "Binary `<<` operator.", shl_fast);
implement_bin_ops!(ShiftRight, shr, "Binary `>>` operator.", shr_fast);
implement_bin_ops!(
    UnsignedShiftRight,
    ushr,
    "Binary `>>>` operator.",
    ushr_fast
);
implement_bin_ops!(Eq, equals, "Binary `==` operator.", equals_fast);
implement_bin_ops!(NotEq, not_equals, "Binary `!=` operator.", not_equals_fast);
implement_bin_ops!(GreaterThan, gt, "Binary `>` operator.", gt_fast);
implement_bin_ops!(GreaterThanOrEq, ge, "Binary `>=` operator.", ge_fast);
implement_bin_ops!(LessThan, lt, "Binary `<` operator.", lt_fast);
implement_bin_ops!(LessThanOrEq, le, "Binary `<=` operator.", le_fast);
implement_bin_ops!(InstanceOf, instance_of, "Binary `instanceof` operator.");
