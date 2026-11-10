use crate::{
    Context, JsValue,
    vm::opcode::{Operation, RegisterOperand},
};

pub(crate) mod array;
pub(crate) mod class;
pub(crate) mod environment;
pub(crate) mod literal;
pub(crate) mod numbers;
pub(crate) mod object;

pub(crate) use array::*;
pub(crate) use class::*;
pub(crate) use environment::*;
pub(crate) use literal::*;
pub(crate) use numbers::*;
pub(crate) use object::*;

macro_rules! implement_store_generics {
    ($name:ident, $push_value:expr, $doc_string:literal) => {
        #[doc= concat!("`", stringify!($name), "` implements the `OpCode` Operation for `Opcode::", stringify!($name), "`\n")]
        #[doc= "\n"]
        #[doc="Operation:\n"]
        #[doc= concat!(" - ", $doc_string)]
        #[derive(Debug, Clone, Copy)]
        pub(crate) struct $name;

        impl $name {
            #[inline(always)]
            pub(super) fn operation(dst: RegisterOperand,  context: &mut Context) {
                context.vm.set_register(dst.into(), $push_value.into());
            }
        }

        impl Operation for $name {
            const NAME: &'static str = stringify!($name);
            const INSTRUCTION: &'static str = stringify!("INST - " + $name);
            const COST: u8 = 1;
        }
    };
}

implement_store_generics!(
    StoreUndefined,
    JsValue::undefined(),
    "Store `undefined` in dst."
);
implement_store_generics!(StoreNull, JsValue::null(), "Store `null` in dst.");
implement_store_generics!(StoreTrue, true, "Store `true` in dst.");
implement_store_generics!(StoreFalse, false, "Store `false` in dst.");
implement_store_generics!(StoreZero, 0, "Store integer `0` in dst.");
implement_store_generics!(StoreOne, 1, "Store integer `1` in dst.");
implement_store_generics!(StoreNan, JsValue::nan(), "Store `NaN` in dst.");
implement_store_generics!(
    StorePositiveInfinity,
    JsValue::positive_infinity(),
    "Store `Infinity` in dst."
);
implement_store_generics!(
    StoreNegativeInfinity,
    JsValue::negative_infinity(),
    "Store `-Infinity` in dst."
);
