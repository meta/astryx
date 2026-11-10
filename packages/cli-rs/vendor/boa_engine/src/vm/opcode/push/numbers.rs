use crate::{
    Context,
    vm::opcode::{Operation, RegisterOperand},
};

macro_rules! implement_store_numbers_with_conversion {
    ($name:ident, $num_type:ty, $doc_string:literal) => {
        #[doc= concat!("`", stringify!($name), "` implements the `OpCode` Operation for `Opcode::", stringify!($name), "`\n")]
        #[doc= "\n"]
        #[doc="Operation:\n"]
        #[doc= concat!(" - ", $doc_string)]
        #[derive(Debug, Clone, Copy)]
        pub(crate) struct $name;

        impl $name {
            #[inline(always)]
            pub(crate) fn operation((dst, value): (RegisterOperand, $num_type),  context: &mut Context) {
                context.vm.set_register(dst.into(), i32::from(value).into());
            }
        }

        impl Operation for $name {
            const NAME: &'static str = stringify!($name);
            const INSTRUCTION: &'static str = stringify!("INST - " + $name);
            const COST: u8 = 1;
        }
    };
}

macro_rules! implement_store_numbers_no_conversion {
    ($name:ident, $num_type:ty, $doc_string:literal) => {
        #[doc= concat!("`", stringify!($name), "` implements the `OpCode` Operation for `Opcode::", stringify!($name), "`\n")]
        #[doc= "\n"]
        #[doc="Operation:\n"]
        #[doc= concat!(" - ", $doc_string)]
        #[derive(Debug, Clone, Copy)]
        pub(crate) struct $name;

        impl $name {
            #[inline(always)]
            pub(crate) fn operation((dst, value): (RegisterOperand, $num_type),  context: &mut Context) {
                context.vm.set_register(dst.into(), value.into());
            }
        }

        impl Operation for $name {
            const NAME: &'static str = stringify!($name);
            const INSTRUCTION: &'static str = stringify!("INST - " + $name);
            const COST: u8 = 1;
        }
    };
}

implement_store_numbers_with_conversion!(StoreInt8, i8, "Store `i8` value in dst");
implement_store_numbers_with_conversion!(StoreInt16, i16, "Store `i16` value in dst");

implement_store_numbers_no_conversion!(StoreInt32, i32, "Store `i32` value in dst");
implement_store_numbers_no_conversion!(StoreFloat, f32, "Store `f32` value in dst");
implement_store_numbers_no_conversion!(StoreDouble, f64, "Store `f64` value in dst");
