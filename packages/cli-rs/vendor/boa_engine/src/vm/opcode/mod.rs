#![allow(clippy::inline_always)]
#![allow(clippy::doc_markdown)]
//! Boa's VM opcode definitions and bytecode dispatch.
//!
//! The bytecompiler lowers ECMAScript runtime semantics into these opcode families, which are then
//! executed by the virtual machine. Most opcode submodules mirror a part of the specification,
//! such as function calls, environment records, iteration, property access, or class evaluation.
//! See the general runtime semantics overview in the [specification][spec].
//!
//! When the specification marks an abstract operation as infallible with `!`, Boa treats the
//! corresponding condition as an internal bytecode invariant. In those cases, malformed
//! bytecode is treated as an engine bug and may trip an assertion instead of returning a
//! recoverable JavaScript exception.
//!
//! [spec]: https://tc39.es/ecma262/#sec-runtime-semantics-evaluation
use crate::{
    Context,
    vm::{completion_record::CompletionRecord, completion_record::IntoCompletionRecord},
};
use args::{Argument, read};
use std::ops::ControlFlow;
use thin_vec::ThinVec;

mod args;

// Operation modules
mod arguments;
mod r#await;
mod binary_ops;
mod call;
mod concat;
mod control_flow;
mod copy;
mod define;
mod delete;
mod environment;
mod function;
mod generator;
mod get;
mod iteration;
mod meta;
mod new;
mod nop;
mod object;
mod pop;
mod push;
mod rest_parameter;
mod set;
mod switch;
mod templates;
mod to;
mod unary_ops;
mod value;

// Operation structs
#[doc(inline)]
pub(crate) use arguments::*;
#[doc(inline)]
pub(crate) use r#await::*;
#[doc(inline)]
pub(crate) use binary_ops::*;
#[doc(inline)]
pub(crate) use call::*;
#[doc(inline)]
pub(crate) use concat::*;
#[doc(inline)]
pub(crate) use control_flow::*;
#[doc(inline)]
pub(crate) use copy::*;
#[doc(inline)]
pub(crate) use define::*;
#[doc(inline)]
pub(crate) use delete::*;
#[doc(inline)]
pub(crate) use environment::*;
#[doc(inline)]
pub(crate) use function::*;
#[doc(inline)]
pub(crate) use generator::*;
#[doc(inline)]
pub(crate) use get::*;
#[doc(inline)]
pub(crate) use iteration::*;
#[doc(inline)]
pub(crate) use meta::*;
#[doc(inline)]
pub(crate) use new::*;
#[doc(inline)]
pub(crate) use nop::*;
#[doc(inline)]
pub(crate) use object::*;
#[doc(inline)]
pub(crate) use pop::*;
#[doc(inline)]
pub(crate) use push::*;
#[doc(inline)]
pub(crate) use rest_parameter::*;
#[doc(inline)]
pub(crate) use set::*;
#[doc(inline)]
pub(crate) use switch::*;
#[doc(inline)]
pub(crate) use templates::*;
#[doc(inline)]
pub(crate) use to::*;
#[doc(inline)]
pub(crate) use unary_ops::*;
#[doc(inline)]
pub(crate) use value::*;

/// Specific opcodes for bindings.
///
/// This separate enum exists to make matching exhaustive where needed.
#[derive(Clone, Copy, Debug)]
pub(crate) enum BindingOpcode {
    Var,
    InitVar,
    InitLexical,
    SetName,
}

/// The `Operation` trait implements the execution code along with the
/// identifying Name and Instruction value for an Boa Opcode.
///
/// This trait should be implemented for a struct that corresponds with
/// any arm of the `OpCode` enum.
pub(crate) trait Operation {
    const NAME: &'static str;
    #[allow(unused)] // TODO: need to double check usage.
    const INSTRUCTION: &'static str;
    const COST: u8;
}

/// The compile time representation of bytecode instructions.
#[derive(Debug)]
pub(crate) struct BytecodeEmitter {
    bytes: Vec<u8>,
}

impl BytecodeEmitter {
    /// Create a new [`BytecodeEmitter`] instance.
    pub(crate) fn new() -> Self {
        Self { bytes: Vec::new() }
    }

    /// Convert the [`BytecodeEmitter`] into a [`Bytecode`] instance.
    pub(crate) fn into_bytecode(self) -> Bytecode {
        Bytecode {
            bytes: self.bytes.into_boxed_slice(),
        }
    }

    /// Get the location of the next opcode in the bytecode.
    pub(crate) fn next_opcode_location(&self) -> Address {
        Address::new(self.bytes.len() as u32)
    }

    /// Patch the jump instruction at the given label with the given address.
    pub(crate) fn patch_jump(&mut self, label: Address, patch: Address) {
        let pos = u32::from(label) as usize;
        let bytes = u32::from(patch).to_le_bytes();
        self.bytes[pos + 1] = bytes[0];
        self.bytes[pos + 2] = bytes[1];
        self.bytes[pos + 3] = bytes[2];
        self.bytes[pos + 4] = bytes[3];
    }

    /// Patch the jump instruction at the given label with jump table addresses.
    pub(crate) fn patch_jump_table(&mut self, label: Address, patch: &[Address]) {
        let length_offset = u32::from(label) as usize + 1;

        let (length, first_offset) = read::<u32>(&self.bytes, length_offset);
        assert_eq!(length as usize, patch.len());

        // Write patched address values.
        for (i, value) in patch.iter().enumerate() {
            let offset = first_offset + i * size_of::<u32>();
            self.bytes[offset..offset + size_of::<u32>()]
                .copy_from_slice(&u32::from(*value).to_le_bytes());
        }
    }
}

#[derive(Clone, Debug, Default)]
/// The bytecode representation of a codeblock.
pub(crate) struct Bytecode {
    pub(crate) bytes: Box<[u8]>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
/// An address is a bytecode offset, displayed as hexadecimal.
pub(crate) struct Address(u32);

impl Address {
    /// Create a new [`Address`] from a u32 value.
    pub(crate) const fn new(value: u32) -> Self {
        Self(value)
    }

    /// Returns the inner `u32` value.
    pub(crate) const fn as_u32(self) -> u32 {
        self.0
    }
}

impl From<Address> for u32 {
    fn from(addr: Address) -> Self {
        addr.0
    }
}

impl From<u32> for Address {
    fn from(value: u32) -> Self {
        Self::new(value)
    }
}

impl std::ops::Add<u32> for Address {
    type Output = Self;

    fn add(self, rhs: u32) -> Self {
        Self::new(self.0 + rhs)
    }
}

impl std::fmt::Display for Address {
    #[inline]
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:06x}", self.0)
    }
}

#[derive(Debug, Clone, Copy)]
/// A register operand is a register index used in bytecode instructions.
pub(crate) struct RegisterOperand(u32);

impl RegisterOperand {
    /// Create a new [`RegisterOperand`] from a u32 value.
    pub(crate) fn new(value: u32) -> Self {
        Self(value)
    }
}

impl From<RegisterOperand> for u32 {
    fn from(value: RegisterOperand) -> Self {
        value.0
    }
}

impl From<RegisterOperand> for usize {
    fn from(value: RegisterOperand) -> Self {
        value.0 as usize
    }
}

impl From<u8> for RegisterOperand {
    fn from(value: u8) -> Self {
        Self::new(value.into())
    }
}

impl From<u16> for RegisterOperand {
    fn from(value: u16) -> Self {
        Self::new(value.into())
    }
}

impl From<u32> for RegisterOperand {
    fn from(value: u32) -> Self {
        Self::new(value)
    }
}

impl std::fmt::Display for RegisterOperand {
    #[inline]
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "r{:02}", self.0)
    }
}

#[derive(Debug, Clone, Copy)]
/// A index operand is e.g. an index into the constant pool
pub(crate) struct IndexOperand(u32);

impl IndexOperand {
    /// Create a new [`IndexOperand`] from a u32 value.
    pub(crate) fn new(value: u32) -> Self {
        Self(value)
    }
}

impl From<IndexOperand> for u32 {
    fn from(value: IndexOperand) -> Self {
        value.0
    }
}

impl From<IndexOperand> for usize {
    fn from(value: IndexOperand) -> Self {
        value.0 as usize
    }
}

impl From<bool> for IndexOperand {
    fn from(value: bool) -> Self {
        Self::new(value.into())
    }
}

impl From<u8> for IndexOperand {
    fn from(value: u8) -> Self {
        Self::new(value.into())
    }
}

impl From<u16> for IndexOperand {
    fn from(value: u16) -> Self {
        Self::new(value.into())
    }
}

impl From<u32> for IndexOperand {
    fn from(value: u32) -> Self {
        Self::new(value)
    }
}

impl std::fmt::Display for IndexOperand {
    #[inline]
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl Opcode {
    fn encode(self) -> u8 {
        self as u8
    }

    pub(crate) fn decode(instruction: u8) -> Self {
        Self::from(instruction)
    }
}

fn encode_instruction<A: Argument>(opcode: Opcode, args: A, bytes: &mut Vec<u8>) {
    bytes.push(opcode.encode());
    args.encode(bytes);
}

macro_rules! generate_opcodes {
    (
        $(
            $(#[$comment:ident $($args:tt)*])*
            $Variant:ident $({
                $(
                    $(#[$fieldinner:ident $($fieldargs:tt)*])*
                    $FieldName:ident : $FieldType:ty
                ),*
                $(,)?
            })? $(=> $mapping:ident)?
        ),*
        $(,)?
    ) => {
        /// The opcodes of the vm.
        #[derive(Debug, Clone, Copy, PartialEq, Eq)]
        #[repr(u8)]
        pub(crate) enum Opcode {
            $(
                $(#[$comment $($args)*])*
                $Variant
            ),*
        }

        impl From<u8> for Opcode {
            #[inline]
            #[allow(non_upper_case_globals)]
            fn from(value: u8) -> Self {
                $(
                    const $Variant: u8 = Opcode::$Variant as u8;
                )*
                match value {
                    $($Variant => Self::$Variant),*
                }
            }
        }

        impl Opcode {
            pub(crate) fn as_str(&self) -> &'static str {
                match self {
                    $(Self::$Variant => $Variant::NAME),*
                }
            }
        }

        impl BytecodeEmitter {
            $(
                pastey::paste! {
                    #[allow(unused)]
                    pub(crate) fn [<emit_ $Variant:snake>](&mut self $( $(, $FieldName: $FieldType)* )? ) {
                        encode_instruction(
                            Opcode::$Variant,
                            ($($($FieldName),*)?),
                            &mut self.bytes,
                        );
                    }
                }
            )*
        }

        type OpcodeHandler = fn(&mut Context, usize) -> ControlFlow<CompletionRecord>;

        pub(crate) const OPCODE_HANDLERS: [OpcodeHandler; 256] = {
            [
                $(
                    pastey::paste! { [<handle_ $Variant:snake>] },
                )*
            ]
        };

        type OpcodeHandlerBudget = fn(&mut Context, usize, &mut u32) -> ControlFlow<CompletionRecord>;

        pub(crate) const OPCODE_HANDLERS_BUDGET: [OpcodeHandlerBudget; 256] = {
            [
                $(
                    pastey::paste! { [<handle_ $Variant:snake _budget>] },
                )*
            ]
        };

        $(
            pastey::paste! {
                #[inline(always)]
                #[allow(unused_parens)]
                fn [<handle_ $Variant:snake>](context: &mut Context, pc: usize) -> ControlFlow<CompletionRecord> {
                    let bytes = &context.vm.frame().code_block.bytecode.bytes;
                    let (args, next_pc) = <($($($FieldType),*)?)>::decode(bytes, pc + 1);
                    context.vm.frame_mut().pc = next_pc as u32;
                    let result = $Variant::operation(args, context);
                    IntoCompletionRecord::into_completion_record(result, context)
                }
            }
        )*

        $(
            pastey::paste! {
                #[inline(always)]
                #[allow(unused_parens)]
                fn [<handle_ $Variant:snake _budget>](context: &mut Context, pc: usize, budget: &mut u32) -> ControlFlow<CompletionRecord> {
                    *budget = budget.saturating_sub(u32::from($Variant::COST));
                    let bytes = &context.vm.frame().code_block.bytecode.bytes;
                    let (args, next_pc) = <($($($FieldType),*)?)>::decode(bytes, pc + 1);
                    context.vm.frame_mut().pc = next_pc as u32;
                    let result = $Variant::operation(args, context);
                    IntoCompletionRecord::into_completion_record(result, context)
                }
            }
        )*

        $(
            $(
                struct $Variant {}
                impl $Variant {
                    #[allow(unused_parens)]
                    #[allow(unused_variables)]
                    #[inline(always)]
                    fn operation(args: (), context: &mut Context) {
                        $mapping::operation(args, context)
                    }
                }

                impl Operation for $Variant {
                    const NAME: &'static str = "Reserved";
                    const INSTRUCTION: &'static str = "INST - Reserved";
                    const COST: u8 = 0;
                }
            )?
        )*

        pub(crate) enum Instruction {
            $(
                $Variant $({
                    $(
                        $(#[$fieldinner $($fieldargs)*])*
                        $FieldName : $FieldType
                    ),*
                })?
            ),*
        }

        impl Bytecode {
            #[allow(unused_parens)]
            pub(crate) fn next_instruction(&self, pc: usize) -> (Instruction, usize) {
                let bytes = &self.bytes;
                let opcode = Opcode::decode(bytes[pc]);

                match opcode {
                    $(
                        Opcode::$Variant => {
                            let (($($($FieldName),*)?), read_size) = <($($($FieldType),*)?)>::decode(bytes, pc + 1);
                            (Instruction::$Variant $({
                                $(
                                    $FieldName: $FieldName
                                ),*
                            })?, read_size)
                        }
                    ),*
                }
            }
        }
    }
}

/// Iterator over the instructions in the compact bytecode.
// #[derive(Debug, Clone)]
pub(crate) struct InstructionIterator<'bytecode> {
    bytes: &'bytecode Bytecode,
    pc: usize,
}

// TODO: see if this can be exposed on all features.
// #[allow(unused)]
impl<'bytecode> InstructionIterator<'bytecode> {
    /// Create a new [`InstructionIterator`] from bytecode array.
    #[inline]
    #[must_use]
    pub(crate) const fn new(bytes: &'bytecode Bytecode) -> Self {
        Self { bytes, pc: 0 }
    }

    /// Get the current program counter.
    #[inline]
    #[must_use]
    pub(crate) const fn pc(&self) -> usize {
        self.pc
    }
}

impl Iterator for InstructionIterator<'_> {
    type Item = (usize, Opcode, Instruction);

    #[inline]
    fn next(&mut self) -> Option<Self::Item> {
        let start_pc = self.pc;
        if self.pc >= self.bytes.bytes.len() {
            return None;
        }

        let bytes = &self.bytes.bytes;
        let opcode = Opcode::decode(bytes[self.pc]);
        // Get instruction and determine how much to advance pc
        let (instruction, read_size) = self.bytes.next_instruction(self.pc);
        self.pc = read_size;
        Some((start_pc, opcode, instruction))
    }
}

generate_opcodes! {
    /// Pop the top value from the stack.
    ///
    /// - Stack: value **=>**
    Pop,

    /// Store integer `0` in dst.
    ///
    /// - Registers:
    ///   - Output: dst
    StoreZero { dst: RegisterOperand },

    /// Store integer `1` in dst.
    ///
    /// - Registers:
    ///   - Output: dst
    StoreOne { dst: RegisterOperand },

    /// Store `i8` value in dst.
    ///
    /// - Operands:
    ///   - value: `i8`
    /// - Registers:
    ///   - Output: dst
    StoreInt8 { dst: RegisterOperand, value: i8 },

    /// Store `i16` value in dst.
    ///
    /// - Operands:
    ///   - value: `i16`
    /// - Registers:
    ///   - Output: dst
    StoreInt16 { dst: RegisterOperand, value: i16 },

    /// Store `i32` value in dst.
    ///
    /// - Operands:
    ///   - value: `i32`
    /// - Registers:
    ///   - Output: dst
    StoreInt32 { dst: RegisterOperand, value: i32 },

    /// Store `f32` value in dst.
    ///
    /// - Operands:
    ///   - value: `f32`
    /// - Registers:
    ///   - Output: dst
    StoreFloat { dst: RegisterOperand, value: f32 },

    /// Store `f64` value in dst.
    ///
    /// - Operands:
    ///   - value: `f64`
    /// - Registers:
    ///   - Output: dst
    StoreDouble { dst: RegisterOperand, value: f64 },

    /// Store `NaN` in dst.
    ///
    /// - Registers:
    ///   - Output: dst
    StoreNan { dst: RegisterOperand },

    /// Store `Infinity` in dst.
    ///
    /// - Registers:
    ///   - Output: dst
    StorePositiveInfinity { dst: RegisterOperand },

    /// Store `-Infinity` in dst.
    ///
    /// - Registers:
    ///   - Output: dst
    StoreNegativeInfinity { dst: RegisterOperand },

    /// Store `null` in dst.
    ///
    /// - Registers:
    ///   - Output: dst
    StoreNull { dst: RegisterOperand },

    /// Store `true` in dst.
    ///
    /// - Registers:
    ///   - Output: dst
    StoreTrue { dst: RegisterOperand },

    /// Store `false` in dst.
    ///
    /// - Registers:
    ///   - Output: dst
    StoreFalse { dst: RegisterOperand },

    /// Store `undefined` in dst.
    ///
    /// - Registers:
    ///   - Output: dst
    StoreUndefined { dst: RegisterOperand },

    /// Store literal value in dst.
    ///
    /// Like strings and bigints. The index operand is used to index into the `literals`
    /// array to get the value.
    ///
    /// - Operands:
    ///   - index: `IndexOperand`
    /// - Registers:
    ///   - Output: dst
    StoreLiteral { dst: RegisterOperand, index: IndexOperand },

    /// Store regexp value in dst.
    ///
    /// - Operands:
    ///   - pattern_index: `IndexOperand`
    ///   - flags: `IndexOperand`
    /// - Registers:
    ///   - Output: dst
    StoreRegexp { dst: RegisterOperand, pattern_index: IndexOperand, flags_index: IndexOperand },

    /// Store empty object `{}` in dst.
    ///
    /// - Registers:
    ///   - Output: dst
    StoreEmptyObject { dst: RegisterOperand },

    /// Get the prototype of a superclass and store it in dst.
    ///
    /// Additionally this sets the `[[prototype]]` of the class and the `DERIVED` flag.
    ///
    /// - Registers:
    ///   - Input: class, superclass
    ///   - Output: dst
    StoreClassPrototype {
        dst: RegisterOperand,
        class: RegisterOperand,
        superclass: RegisterOperand
    },

    /// Set the prototype of a class object.
    ///
    /// - Registers:
    ///   - Input: class, prototype
    ///   - Output: dst
    SetClassPrototype {
        dst: RegisterOperand,
        prototype: RegisterOperand,
        class: RegisterOperand
    },

    /// Set home object internal slot of an object literal method.
    ///
    /// - Registers:
    ///   - Input: function, home
    SetHomeObject {
        function: RegisterOperand,
        home: RegisterOperand
    },

    /// Get home object internal slot of an object literal method.
    ///
    /// - Registers (inout):
    ///   - function:
    ///     - in: `JsObject<OrdinaryFunction>`.
    ///     - out: `JsObject` or `null` if the home object is not set.
    GetHomeObject {
        function: RegisterOperand,
    },

    /// Set the prototype of an object if the value is an object or null.
    ///
    /// - Registers (in):
    ///   - object: `JsObject`.
    ///   - prototype: `JsObject` or `null`
    SetPrototype {
        object: RegisterOperand,
        prototype: RegisterOperand
    },

    /// Get the prototype of an object.
    ///
    /// - Registers (inout):
    ///   - object:
    ///     - in: `JsObject`.
    ///     - out: `JsObject` or `null`.
    GetPrototype {
        object: RegisterOperand,
    },

    /// Store an empty array in dst.
    ///
    /// - Registers:
    ///   - Output: dst
    StoreNewArray { dst: RegisterOperand },

    /// Push a value to an array.
    ///
    /// - Registers:
    ///   - Input: array, value
    PushValueToArray { value: RegisterOperand, array: RegisterOperand },

    /// Push an empty element/hole to an array.
    ///
    /// - Registers:
    ///   - Input: array
    PushElisionToArray { array: RegisterOperand },

    /// Push all iterator values to an array.
    ///
    /// - Registers:
    ///   - Input: array
    PushIteratorToArray { array: RegisterOperand },

    /// Binary `+` operator.
    ///
    /// - Registers
    ///   - Input: lhs, rhs
    ///   - Output: dst
    Add { dst: RegisterOperand, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Binary `-` operator.
    ///
    /// - Registers
    ///   - Input: lhs, rhs
    ///   - Output: dst
    Sub { dst: RegisterOperand, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Binary `/` operator.
    ///
    /// - Registers
    ///   - Input: lhs, rhs
    ///   - Output: dst
    Div { dst: RegisterOperand, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Binary `*` operator.
    ///
    /// - Registers
    ///   - Input: lhs, rhs
    ///   - Output: dst
    Mul { dst: RegisterOperand, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Binary `%` operator.
    ///
    /// - Registers
    ///   - Input: lhs, rhs
    ///   - Output: dst
    Mod { dst: RegisterOperand, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Binary `**` operator.
    ///
    /// - Registers
    ///   - Input: lhs, rhs
    ///   - Output: dst
    Pow { dst: RegisterOperand, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Binary `>>` operator.
    ///
    /// - Registers
    ///   - Input: lhs, rhs
    ///   - Output: dst
    ShiftRight { dst: RegisterOperand, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Binary `<<` operator.
    ///
    /// - Registers:
    ///   - Input: lhs, rhs
    ///   - Output: dst
    ShiftLeft { dst: RegisterOperand, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Binary `>>>` operator.
    ///
    /// - Registers:
    ///   - Input: lhs, rhs
    ///   - Output: dst
    UnsignedShiftRight { dst: RegisterOperand, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Binary bitwise `|` operator.
    ///
    /// - Registers:
    ///   - Input: lhs, rhs
    ///   - Output: dst
    BitOr { dst: RegisterOperand, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Binary bitwise `&` operator.
    ///
    /// - Registers:
    ///   - Input: lhs, rhs
    ///   - Output: dst
    BitAnd { dst: RegisterOperand, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Binary bitwise `^` operator.
    ///
    /// - Registers:
    ///   - Input: lhs, rhs
    ///   - Output: dst
    BitXor { dst: RegisterOperand, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Unary bitwise `~` operator.
    ///
    /// - Registers:
    ///   - Input: lhs, rhs
    ///   - Output: dst
    BitNot { value: RegisterOperand },

    /// Binary `in` operator.
    ///
    /// - Registers:
    ///   - Input: lhs, rhs
    ///   - Output: dst
    In { dst: RegisterOperand, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Binary `in` operator for private names.
    ///
    /// - Operands: index: `u32`
    /// - Registers:
    ///   - Input: rhs
    ///   - Output: dst
    InPrivate { dst: RegisterOperand, index: IndexOperand, rhs: RegisterOperand },

    /// Binary `==` operator.
    ///
    /// - Registers:
    ///   - Input: lhs, rhs
    ///   - Output: dst
    Eq { dst: RegisterOperand, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Binary `===` operator.
    ///
    /// - Registers:
    ///   - Input: lhs, rhs
    ///   - Output: dst
    StrictEq { dst: RegisterOperand, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Binary `!=` operator.
    ///
    /// - Registers:
    ///   - Input: lhs, rhs
    ///   - Output: dst
    NotEq { dst: RegisterOperand, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Binary `!==` operator.
    ///
    /// - Registers:
    ///   - Input: lhs, rhs
    ///   - Output: dst
    StrictNotEq { dst: RegisterOperand, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Binary `>` operator.
    ///
    /// - Registers:
    ///   - Input: lhs, rhs
    ///   - Output: dst
    GreaterThan { dst: RegisterOperand, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Binary `>=` operator.
    ///
    /// - Registers:
    ///   - Input: lhs, rhs
    ///   - Output: dst
    GreaterThanOrEq { dst: RegisterOperand, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Binary `<` operator.
    ///
    /// - Registers:
    ///   - Input: lhs, rhs
    ///   - Output: dst
    LessThan { dst: RegisterOperand, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Binary `<=` operator.
    ///
    /// - Registers:
    ///   - Input: lhs, rhs
    ///   - Output: dst
    LessThanOrEq { dst: RegisterOperand, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Binary `instanceof` operator.
    ///
    /// - Registers:
    ///   - Input: lhs, rhs
    ///   - Output: dst
    InstanceOf { dst: RegisterOperand, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Binary logical `&&` operator.
    ///
    /// This is a short-circuit operator, if the `lhs` value is `false`, then it jumps to `exit` address.
    ///
    /// - Operands:
    ///   - address: `u32`
    /// - Registers:
    ///   - Input: value
    ///   - Output: value
    LogicalAnd { address: Address, value: RegisterOperand },

    /// Binary logical `||` operator.
    ///
    /// This is a short-circuit operator, if the `lhs` value is `true`, then it jumps to `exit` address.
    ///
    /// - Operands:
    ///   - address: `Address`
    /// - Registers:
    ///   - Input: value
    ///   - Output: value
    LogicalOr { address: Address, value: RegisterOperand },

    /// Binary `??` operator.
    ///
    /// This is a short-circuit operator, if the `lhs` value is **not** `null` or `undefined`,
    /// then it jumps to `exit` address.
    ///
    /// - Operands:
    ///   - address: `Address`
    /// - Registers:
    ///   - Input: value
    ///   - Output: value
    Coalesce { address: Address, value: RegisterOperand },

    /// Unary `typeof` operator.
    ///
    /// - Registers:
    ///   - Input: value
    ///   - Output: value
    TypeOf { value: RegisterOperand },

    /// Unary logical `!` operator.
    ///
    /// - Registers:
    ///   - Input: value
    ///   - Output: value
    LogicalNot { value: RegisterOperand },

    /// Unary `+` operator.
    ///
    /// - Registers:
    ///   - Input: value
    ///   - Output: value
    Pos { value: RegisterOperand },

    /// Unary `-` operator.
    ///
    /// - Registers:
    ///   - Input: value
    ///   - Output: value
    Neg { value: RegisterOperand },

    /// Unary `++` operator.
    ///
    /// - Registers:
    ///   - Input: src
    ///   - Output: dst
    Inc { dst: RegisterOperand, src: RegisterOperand },

    /// Unary `--` operator.
    ///
    /// - Registers:
    ///   - Input: src
    ///   - Output: dst
    Dec { dst: RegisterOperand, src: RegisterOperand },

    /// Declare `var` type variable.
    ///
    /// - Operands:
    ///   - binding_index: `IndexOperand`
    DefVar { binding_index: IndexOperand },

    /// Declare and initialize `var` type variable.
    ///
    /// - Operands:
    ///   - binding_index: `IndexOperand`
    /// - Registers:
    ///   - Input: src
    DefInitVar { src: RegisterOperand, binding_index: IndexOperand },

    /// Initialize a lexical binding.
    ///
    /// - Operands:
    ///   - binding_index: `IndexOperand`
    /// - Registers:
    ///   - Input: src
    PutLexicalValue { src: RegisterOperand, binding_index: IndexOperand },

    /// Throws an error because the binding access is illegal.
    ///
    /// - Operands:
    ///   -index: `IndexOperand`
    ThrowMutateImmutable { index: IndexOperand },

    /// Get i-th argument of the current frame.
    ///
    /// Returns `undefined` if `arguments.len()` < `index`.
    ///
    /// - Operands:
    ///   - index: `IndexOperand`
    /// - Registers:
    ///   - Output: dst
    GetArgument { index: IndexOperand, dst: RegisterOperand },

    /// Find a binding on the environment chain and store its value in dst.
    ///
    /// - Operands:
    ///   - binding_index: `IndexOperand`
    /// - Registers:
    ///   - Output: dst
    GetName { dst: RegisterOperand, binding_index: IndexOperand },

    /// Find a binding in the global object and store its value in dst.
    ///
    /// - Operands:
    ///   - binding_index: `IndexOperand`
    ///   - ic_index: `IndexOperand`
    /// - Registers:
    ///   - Output: dst
    GetNameGlobal { dst: RegisterOperand, binding_index: IndexOperand, ic_index: IndexOperand },

    /// Find a binding on the environment and set the `current_binding` of the current frame.
    ///
    /// - Operands:
    ///   - binding_index: `IndexOperand`
    GetLocator { binding_index: IndexOperand },

    /// Find a binding on the environment chain and store its value in dst, and push its
    /// `BindingLocator` to the `bindings_stack`.
    ///
    /// - Operands:
    ///   - binding_index: `IndexOperand`
    /// - Registers:
    ///   - Output: dst
    GetNameAndLocator { dst: RegisterOperand, binding_index: IndexOperand },

    /// Find a binding on the environment chain and store its value in dst. If the binding does not exist, store undefined.
    ///
    /// - Operands:
    ///   - binding_index: `IndexOperand`
    /// - Registers:
    ///   - Output: dst
    GetNameOrUndefined { dst: RegisterOperand, binding_index: IndexOperand },

    /// Find a binding on the environment chain and assign its value.
    ///
    /// - Operands:
    ///   - binding_index: `IndexOperand`
    /// - Registers:
    ///   - Input: src
    SetName { src: RegisterOperand, binding_index: IndexOperand },

    /// Assigns a value to the binding pointed by the top of the `bindings_stack`.
    ///
    /// - Registers:
    ///   - Input: src
    SetNameByLocator { src: RegisterOperand },

    /// Deletes a property of the global object.
    ///
    /// - Operands:
    ///   - binding_index: `IndexOperand`
    /// - Registers:
    ///   - Output: dst
    DeleteName { dst: RegisterOperand, binding_index: IndexOperand },

    /// Gets a method from an object, or `undefined` if the method does not exist.
    ///
    /// Operands:
    ///  - name_index: constant `JsString`.
    ///
    /// Registers (inout)
    ///  - object: `JsObject` as input, `JsObject` or `undefined` as output.
    GetMethod { object: RegisterOperand, name_index: IndexOperand },

    /// Get the length property by name from an object.
    ///
    /// Like `object.name`
    ///
    /// - Operands:
    ///   - ic_index: `IndexOperand`
    /// - Registers:
    ///   - Input: value
    ///   - Output: dst
    GetLengthProperty {
        dst: RegisterOperand,
        value: RegisterOperand,
        ic_index: IndexOperand
    },

    /// Get a property by name from an object.
    ///
    /// Like `object.name`
    ///
    /// - Operands:
    ///   - ic_index: `IndexOperand`
    /// - Registers:
    ///   - Input: value
    ///   - Output: dst
    GetPropertyByName {
        dst: RegisterOperand,
        value: RegisterOperand,
        ic_index: IndexOperand
    },

    /// Get a property by name from an object.
    ///
    /// Like `object.name`
    ///
    /// - Operands:
    ///   - ic_index: `IndexOperand`
    /// - Registers:
    ///   - Input: receiver, value
    ///   - Output: dst
    GetPropertyByNameWithThis {
        dst: RegisterOperand,
        receiver: RegisterOperand,
        value: RegisterOperand,
        ic_index: IndexOperand
    },

    /// Get a property by value from an object.
    ///
    /// Like `object[key]`
    ///
    /// - Registers:
    ///   - Input: object, receiver, key
    ///   - Output: dst
    GetPropertyByValue {
        dst: RegisterOperand,
        key: RegisterOperand,
        receiver: RegisterOperand,
        object: RegisterOperand
    },

    /// Get a property by value from an object.
    ///
    /// Like `object[key]`
    ///
    /// - Registers:
    ///   - Input: object, receiver
    ///   - Output: dst, key
    GetPropertyByValuePush {
        dst: RegisterOperand,
        key: RegisterOperand,
        receiver: RegisterOperand,
        object: RegisterOperand
    },

    /// Sets a property by name of an object.
    ///
    /// Like `object.name = value`
    ///
    /// - Operands:
    ///   - ic_index: `IndexOperand`
    /// - Registers:
    ///   - Input: object, value
    SetPropertyByName {
        value: RegisterOperand,
        object: RegisterOperand,
        ic_index: IndexOperand
    },

    /// Sets a property by name of an object.
    ///
    /// Like `object.name = value`
    ///
    /// - Operands:
    ///   - ic_index: `IndexOperand`
    /// - Registers:
    ///   - Input: object,receiver, value
    SetPropertyByNameWithThis {
        value: RegisterOperand,
        receiver: RegisterOperand,
        object: RegisterOperand,
        ic_index: IndexOperand
    },

    /// Sets the name of a function object.
    ///
    /// This operation is corresponds to the `SetFunctionName` abstract operation in the [spec].
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-setfunctionname
    ///
    /// - Operands:
    ///   - prefix
    ///     - 0: no prefix
    ///     - 1: "get "
    ///     - 2: "set "
    /// - Registers:
    ///   - Input: function, name
    SetFunctionName { function: RegisterOperand, name: RegisterOperand, prefix: IndexOperand },

    /// Defines a own property of an object by name.
    ///
    /// - Operands:
    ///   - name_index: `IndexOperand`
    /// - Registers:
    ///   - Input: object, value
    DefineOwnPropertyByName { object: RegisterOperand, value: RegisterOperand, name_index: IndexOperand },

    /// Defines a static class method by name.
    ///
    /// - Operands:
    ///   - name_index: `IndexOperand`
    /// - Registers:
    ///   - Input: object, value
    DefineClassStaticMethodByName {
        value: RegisterOperand,
        object: RegisterOperand,
        name_index: IndexOperand
    },

    /// Defines a class method by name.
    ///
    /// - Operands:
    ///   - name_index: `IndexOperand`
    /// - Registers:
    ///   - Input: object, value
    DefineClassMethodByName {
        value: RegisterOperand,
        object: RegisterOperand,
        name_index: IndexOperand
    },

    /// Sets a property by value of an object.
    ///
    /// Like `object[key] = value`
    ///
    /// - Registers:
    ///   - Input: value, key, receiver, object
    SetPropertyByValue {
        value: RegisterOperand,
        key: RegisterOperand,
        receiver: RegisterOperand,
        object: RegisterOperand
    },

    /// Defines a own property of an object by value.
    ///
    /// - Registers:
    ///   - Input: object, key, value
    DefineOwnPropertyByValue {
        value: RegisterOperand,
        key: RegisterOperand,
        object: RegisterOperand
    },

    /// Defines a static class method by value.
    ///
    /// - Registers:
    ///   - Input: object, key, value
    DefineClassStaticMethodByValue {
        value: RegisterOperand,
        key: RegisterOperand,
        object: RegisterOperand
    },

    /// Defines a class method by value.
    ///
    /// - Registers:
    ///   - Input: object, key, value
    DefineClassMethodByValue {
        value: RegisterOperand,
        key: RegisterOperand,
        object: RegisterOperand
    },

    /// Sets a getter property by name of an object.
    ///
    /// Like `get name() value`
    ///
    /// - Operands:
    ///   - name_index: `IndexOperand`
    /// - Registers:
    ///   - Input: object, value
    SetPropertyGetterByName { object: RegisterOperand, value: RegisterOperand, name_index: IndexOperand },

    /// Defines a static getter class method by name.
    ///
    /// Like `static get name() value`
    ///
    /// - Operands:
    ///   - name_index: `IndexOperand`
    /// - Registers:
    ///   - Input: object, value
    DefineClassStaticGetterByName {
        value: RegisterOperand,
        object: RegisterOperand,
        name_index: IndexOperand
    },

    /// Defines a getter class method by name.
    ///
    /// Like `get name() value`
    ///
    /// - Operands:
    ///   - name_index: `IndexOperand`
    /// - Registers:
    ///   - Input: object, value
    DefineClassGetterByName {
        value: RegisterOperand,
        object: RegisterOperand,
        name_index: IndexOperand
    },

    /// Sets a getter property by value of an object.
    ///
    /// Like `get [key]() value`
    ///
    /// - Registers:
    ///   - Input: object, key, value
    SetPropertyGetterByValue {
        value: RegisterOperand,
        key: RegisterOperand,
        object: RegisterOperand
    },

    /// Defines a static getter class method by value.
    ///
    /// Like `static get [key]() value`
    ///
    /// - Registers:
    ///   - Input: object, key, value
    DefineClassStaticGetterByValue {
        value: RegisterOperand,
        key: RegisterOperand,
        object: RegisterOperand
    },

    /// Defines a getter class method by value.
    ///
    /// Like `get [key]() value`
    ///
    /// - Registers:
    ///   - Input: object, key, value
    DefineClassGetterByValue {
        value: RegisterOperand,
        key: RegisterOperand,
        object: RegisterOperand
    },

    /// Sets a setter property by name of an object.
    ///
    /// Like `set name() value`
    ///
    /// - Operands:
    ///   - name_index: `IndexOperand`
    /// - Registers:
    ///   - Input: object, value
    SetPropertySetterByName { object: RegisterOperand, value: RegisterOperand, name_index: IndexOperand },

    /// Defines a static setter class method by name.
    ///
    /// Like `static set name() value`
    ///
    /// - Operands:
    ///   - name_index: `IndexOperand`
    /// - Registers:
    ///   - Input: object, value
    DefineClassStaticSetterByName {
        value: RegisterOperand,
        object: RegisterOperand,
        name_index: IndexOperand
    },

    /// Defines a setter class method by name.
    ///
    /// Like `set name() value`
    ///
    /// - Operands:
    ///   - name_index: `IndexOperand`
    /// - Registers:
    ///   - Input: object, value
    DefineClassSetterByName {
        value: RegisterOperand,
        object: RegisterOperand,
        name_index: IndexOperand
    },

    /// Sets a setter property by value of an object.
    ///
    /// Like `set [key]() value`
    ///
    /// - Registers:
    ///   - Input: object, key, value
    SetPropertySetterByValue {
        value: RegisterOperand,
        key: RegisterOperand,
        object: RegisterOperand
    },

    /// Defines a static setter class method by value.
    ///
    /// Like `static set [key]() value`
    ///
    /// - Registers:
    ///   - Input: object, key, value
    DefineClassStaticSetterByValue {
        value: RegisterOperand,
        key: RegisterOperand,
        object: RegisterOperand
    },

    /// Defines a setter class method by value.
    ///
    /// Like `set [key]() value`
    ///
    /// - Registers:
    ///   - Input: object, key, value
    DefineClassSetterByValue {
        value: RegisterOperand,
        key: RegisterOperand,
        object: RegisterOperand
    },

    /// Set the value of a private property of an object by it's name.
    ///
    /// Like `obj.#name = value`
    ///
    /// - Operands:
    ///   - name_index: `IndexOperand`
    /// - Registers:
    ///   - Input: object, value
    SetPrivateField { value: RegisterOperand, object: RegisterOperand, name_index: IndexOperand },

    /// Define a private property of a class constructor by it's name.
    ///
    /// Like `#name = value`
    ///
    /// - Operands:
    ///   - name_index: `IndexOperand`
    /// - Registers:
    ///   - Input: object, value
    DefinePrivateField { object: RegisterOperand, value: RegisterOperand, name_index: IndexOperand },

    /// Set a private method of a class constructor by it's name.
    ///
    /// Like `#name() {}`
    ///
    /// - Operands:
    ///   - name_index: `IndexOperand`
    /// - Registers:
    ///   - Input: object, value
    SetPrivateMethod { object: RegisterOperand, value: RegisterOperand, name_index: IndexOperand },

    /// Set a private setter property of a class constructor by it's name.
    ///
    /// Like `set #name() {}`
    ///
    /// - Operands:
    ///   - name_index: `IndexOperand`
    /// - Registers:
    ///   - Input: object, value
    SetPrivateSetter { object: RegisterOperand, value: RegisterOperand, name_index: IndexOperand },

    /// Set a private getter property of a class constructor by it's name.
    ///
    /// Like `get #name() {}`
    ///
    /// - Operands:
    ///   - name_index: `IndexOperand`
    /// - Registers:
    ///   - Input: object, value
    SetPrivateGetter { object: RegisterOperand, value: RegisterOperand, name_index: IndexOperand },

    /// Get a private property by name from an object and store it in dst.
    ///
    /// Like `object.#name`
    ///
    /// - Operands:
    ///   - name_index: `IndexOperand`
    /// - Registers:
    ///   - Input: object
    ///   - Output: dst
    GetPrivateField { dst: RegisterOperand, object: RegisterOperand, name_index: IndexOperand },

    /// Push a field to a class.
    ///
    /// - Operands:
    ///   - name_index: `IndexOperand`
    ///   - is_anonymous_function: `bool`
    /// - Registers:
    ///   - Input: object, value
    PushClassField { object: RegisterOperand, name: RegisterOperand, value: RegisterOperand, is_anonymous_function: IndexOperand },

    /// Push a private field to the class.
    ///
    /// - Operands:
    ///   - name_index: `IndexOperand`
    /// - Registers:
    ///   - Input: object, value
    PushClassFieldPrivate { object: RegisterOperand, value: RegisterOperand, name_index: IndexOperand },

    /// Push a private getter to the class.
    ///
    /// - Operands:
    ///   - name_index: `IndexOperand`
    /// - Registers:
    ///   - Input: object, value
    PushClassPrivateGetter { object: RegisterOperand, value: RegisterOperand, name_index: IndexOperand },

    /// Push a private setter to the class.
    ///
    /// - Operands:
    ///   - name_index: `IndexOperand`
    /// - Registers:
    ///   - Input: object, value
    PushClassPrivateSetter { object: RegisterOperand, value: RegisterOperand, name_index: IndexOperand },

    /// Push a private method to the class.
    ///
    /// - Operands:
    ///   - name_index: `IndexOperand`
    /// - Registers:
    ///   - Input: object, proto, value
    PushClassPrivateMethod { object: RegisterOperand, proto: RegisterOperand, value: RegisterOperand, name_index: IndexOperand },

    /// Deletes a property by name of an object.
    ///
    /// Like `delete object.key`
    ///
    /// - Operands:
    ///   - name_index: `IndexOperand`
    /// - Registers:
    ///   - Input: object
    DeletePropertyByName { object: RegisterOperand, name_index: IndexOperand },

    /// Deletes a property by value of an object.
    ///
    /// Like `delete object[key]`
    ///
    /// - Registers:
    ///   - Input: object, key
    DeletePropertyByValue { object: RegisterOperand, key: RegisterOperand },

    /// Throws an error when trying to delete a property of `super`
    DeleteSuperThrow,

    /// Copy all properties of one object to another object.
    ///
    /// - Registers:
    ///   - Input: object, source, excluded_keys
    CopyDataProperties { object: RegisterOperand, source: RegisterOperand, excluded_keys: ThinVec<RegisterOperand> },

    /// Call ToPropertyKey on the value on the stack.
    ///
    /// - Registers:
    ///   - Input: src
    ///   - Output: dst
    ToPropertyKey { src: RegisterOperand, dst: RegisterOperand },

    /// Unconditional jump to address.
    ///
    /// - Operands:
    ///   - address: `u32`
    Jump { address: Address },

    /// Conditional jump to address.
    ///
    /// If the value popped is [`truthy`][truthy] then jump to `address`.
    ///
    /// - Operands:
    ///   - address: `Address`
    /// - Registers (in):
    ///   - `value`: `JsValue`
    ///
    /// [truthy]: https://developer.mozilla.org/en-US/docs/Glossary/Truthy
    JumpIfTrue { address: Address, value: RegisterOperand },

    /// Conditional jump to address.
    ///
    /// If the value popped is [`falsy`][falsy] then jump to `address`.
    ///
    /// - Operands:
    ///   - address: `Address`
    /// - Registers (in):
    ///   - `value`: `JsValue`
    ///
    /// [falsy]: https://developer.mozilla.org/en-US/docs/Glossary/Falsy
    JumpIfFalse { address: Address, value: RegisterOperand },

    /// Conditional jump to address.
    ///
    /// If the value popped is not undefined jump to `address`.
    ///
    /// - Operands:
    ///   - address: `Address`.
    /// - Registers (in):
    ///   - value: `JsValue`
    JumpIfNotUndefined { address: Address, value: RegisterOperand },

    /// Conditional jump to address.
    ///
    /// If the value popped is undefined jump to `address`.
    ///
    /// - Operands:
    ///   - address: `Address`.
    /// - Registers (in):
    ///   - value: `JsValue`.
    JumpIfNullOrUndefined { address: Address, value: RegisterOperand },

    /// Fused `<` comparison + conditional jump.
    ///
    /// Jumps to `address` if `!(lhs < rhs)`.
    ///
    /// - Operands:
    ///   - address: `u32`
    /// - Registers:
    ///   - Input: lhs, rhs
    JumpIfNotLessThan { address: Address, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Fused `<=` comparison + conditional jump.
    ///
    /// Jumps to `address` if `!(lhs <= rhs)`.
    ///
    /// - Operands:
    ///   - address: `u32`
    /// - Registers:
    ///   - Input: lhs, rhs
    JumpIfNotLessThanOrEqual { address: Address, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Fused `>` comparison + conditional jump.
    ///
    /// Jumps to `address` if `!(lhs > rhs)`.
    ///
    /// - Operands:
    ///   - address: `u32`
    /// - Registers:
    ///   - Input: lhs, rhs
    JumpIfNotGreaterThan { address: Address, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Fused `>=` comparison + conditional jump.
    ///
    /// Jumps to `address` if `!(lhs >= rhs)`.
    ///
    /// - Operands:
    ///   - address: `u32`
    /// - Registers:
    ///   - Input: lhs, rhs
    JumpIfNotGreaterThanOrEqual { address: Address, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Conditional jump to address.
    ///
    /// Jump to `address` if two values are not equal.
    ///
    /// - Operands:
    ///   - address: `Address`
    /// - Registers (in):
    ///   - lhs: `JsValue`.
    ///   - rhs: `JsValue`.
    JumpIfNotEqual { address: Address, lhs: RegisterOperand, rhs: RegisterOperand },

    /// Jump table that jumps depending on top value of the stack.
    ///
    /// This is used to handle special cases when we call `continue`, `break` or `return` in a try block,
    /// that has finally block.
    ///
    /// Operands: index: Register, count: `u32`, address: `Address` * count
    JumpTable { index: u32, addresses: ThinVec<Address> },

    /// Throw exception.
    ///
    /// This sets pending exception and searches for an exception handler.
    ///
    /// - Registers:
    ///   - Input: src
    Throw { src: RegisterOperand },

    /// Rethrow thrown exception.
    ///
    /// This is also used to handle generator `return()` call, we throw an empty exception, by setting pending exception to [`None`],
    /// propagating it and calling finally code until there is no exception handler left, in that case we consume the empty exception and return
    /// from the generator.
    ReThrow,

    /// Get the thrown pending exception (if it's set) and store it in dst.
    ///
    /// If there is no pending exception, which can happen if we are handling `return()` call on generator,
    /// then we rethrow the empty exception. See [`Opcode::ReThrow`].
    ///
    /// - Registers:
    ///   - Output: dst
    Exception { dst: RegisterOperand },

    /// Get the thrown pending exception if it's set and store `true` in `has_exception`, otherwise store `false`.
    ///
    /// - Registers:
    ///   - Output: exception, has_exception
    MaybeException { has_exception: RegisterOperand, exception: RegisterOperand },

    /// Throw a new `TypeError` exception
    ///
    /// - Operands:
    ///   - message: `IndexOperand`
    ThrowNewTypeError { message: IndexOperand },

    /// Throw a new `ReferenceError` exception
    ///
    /// - Operands:
    ///   - message: `IndexOperand`
    ThrowNewReferenceError { message: IndexOperand },

    /// Gets the function object of the current function environment
    ///
    /// - Registers (out):
    ///   - function_object: `JsObject`.
    GetFunctionObject { function_object: RegisterOperand },

    /// Pushes `this` value
    ///
    /// - Registers:
    ///   - Output: dst
    This { dst: RegisterOperand },

    /// Pushes `this` value that is related to the object environment of the given binding
    ///
    /// - Operands:
    ///   - index: `IndexOperand`
    /// - Registers:
    ///   - Output: dst
    ThisForObjectEnvironmentName { dst: RegisterOperand, index: IndexOperand },

    /// Execute the `super()` method.
    ///
    /// - Operands:
    ///   - argument_count: `IndexOperand`
    /// - Stack: super_constructor, argument_1, ... argument_n **=>**
    SuperCall { argument_count: IndexOperand },

    /// Execute the `super()` method where the arguments contain spreads.
    ///
    /// Operands:
    ///
    /// Stack: super_constructor, arguments_array **=>**
    SuperCallSpread,

    /// Execute the `super()` method when no constructor of the class is defined.
    ///
    /// Operands:
    ///
    /// Stack: argument_n, ... argument_1 **=>**
    SuperCallDerived,

    /// Binds `this` value and initializes the instance elements.
    ///
    /// Performs steps 7-12 of [`SuperCall: super Arguments`][spec]
    ///
    /// - Registers:
    ///   - Input: value
    ///   - Output: value
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-super-keyword-runtime-semantics-evaluation
    BindThisValue { value: RegisterOperand },

    /// Dynamically import a module.
    ///
    /// - Operands:
    ///   - phase: `IndexOperand` (0 = evaluation, 1 = defer, 2 = source)
    /// - Registers:
    ///   - Input: specifier, options
    ///   - Output: specifier
    ImportCall { specifier: RegisterOperand, options: RegisterOperand, phase: IndexOperand },

    /// Strict equal compare two register values,
    /// if true jumps to address.
    /// - Operands:
    ///   - address: `Address`
    /// - Registers:
    ///   - Input: value, condition
    Case { address: Address, value: RegisterOperand, condition: RegisterOperand },

    /// Get function from the pre-compiled inner functions.
    ///
    /// - Operands:
    ///   - index: `IndexOperand`
    /// - Registers:
    ///   - Output: dst
    GetFunction { dst: RegisterOperand, index: IndexOperand },

    /// Call a function named "eval".
    ///
    /// - Operands:
    ///   - argument_count: `IndexOperand`
    ///   - scope_index: `IndexOperand`
    /// - Stack: this, func, argument_1, ... argument_n **=>** result
    CallEval { argument_count: IndexOperand, scope_index: IndexOperand },

    /// Call a function named "eval" where the arguments contain spreads.
    ///
    /// - Operands:
    ///   - scope_index: `IndexOperand`
    /// - Stack: Stack: this, func, arguments_array **=>** result
    CallEvalSpread { scope_index: IndexOperand },

    /// Call a function.
    ///
    /// - Operands:
    ///   - argument_count: `IndexOperand`
    /// - Stack: this, func, argument_1, ... argument_n **=>** result
    Call { argument_count: IndexOperand },

    /// Call a function where the arguments contain spreads.
    ///
    /// Operands:
    ///
    /// Stack: this, func, arguments_array **=>** result
    CallSpread,

    /// Call construct on a function.
    ///
    /// - Operands:
    ///   - argument_count: `IndexOperand`
    /// - Stack: this, func, argument_1, ... argument_n **=>** result
    New { argument_count: IndexOperand },

    /// Call construct on a function where the arguments contain spreads.
    ///
    /// Operands:
    ///
    /// Stack: arguments_array, func **=>** result
    NewSpread,

    /// Check return from a function.
    CheckReturn,

    /// Return from a function.
    Return,

    /// Close an async generator function.
    AsyncGeneratorClose,

    /// Creates the Generator object and yields.
    ///
    /// - Stack: **=>** resume_kind
    Generator,

    /// Creates the AsyncGenerator object and yields.
    ///
    /// - Stack: **=>** resume_kind
    AsyncGenerator,

    /// Set return value of a function.
    ///
    /// - Registers:
    ///   - Input: src
    SetAccumulator { src: RegisterOperand },

    // Set return value of a function.
    ///
    /// - Registers:
    ///   - Output: dst
    SetRegisterFromAccumulator { dst: RegisterOperand },

    /// Move value of operand `src` to register `dst`.
    ///
    /// - Registers:
    ///   - Input: src
    ///   - Output: dst
    Move { dst: RegisterOperand, src: RegisterOperand },

    /// Pop value from the stack and push to register `dst`
    ///
    /// - Registers:
    ///   - Output: dst
    PopIntoRegister { dst: RegisterOperand },

    /// Copy value at register `src` and push it on the stack.
    ///
    /// - Registers:
    ///   - Input: src
    PushFromRegister { src: RegisterOperand },

    /// Push a declarative environment.
    ///
    /// - Operands:
    ///   - scope_index: `IndexOperand`
    PushScope { scope_index: IndexOperand },

    /// Push an object environment.
    ///
    /// - Registers:
    ///   - Input: src
    PushObjectEnvironment { src: RegisterOperand },

    /// Pop the current environment.
    PopEnvironment,

    /// Increment loop iteration count.
    ///
    /// Used for limiting the loop iteration.
    IncrementLoopIteration,

    /// Creates the ForInIterator of an object.
    ///
    /// - Registers:
    ///   - Input: src
    CreateForInIterator { src: RegisterOperand },

    /// Gets the iterator of an object.
    ///
    /// - Registers:
    ///   - Input: src
    /// - Iterator Stack: **=>** `iterator`
    GetIterator { src: RegisterOperand },

    /// Gets the async iterator of an object.
    ///
    /// - Registers:
    ///   - Input: src
    /// - Iterator Stack: **=>** `iterator`
    GetAsyncIterator { src: RegisterOperand },

    /// Pop an iterator from the iterators stack
    /// - Registers (out)
    ///   - iterator: `JsObject`.
    ///   - next: `JsValue`.
    IteratorPop { iterator: RegisterOperand, next: RegisterOperand },

    /// Pushes an iterator on the iterators stack
    /// - Registers (in)
    ///   - iterator: `JsObject`.
    ///   - next: `JsValue`.
    IteratorPush { iterator: RegisterOperand, next: RegisterOperand },

    /// Calls the `next` method of `iterator`, updating its record with the next value.
    ///
    /// - Iterator Stack: `iterator` **=>** `iterator`
    IteratorNext,

    /// Updates the result of the currently active iterator.
    /// - Registers (inout)
    ///  - result: `JsValue` (in), `bool` (out) with the `done` value of the iterator.
    IteratorUpdateResult { result: RegisterOperand },

    /// Returns `true` if the current iterator is done, or `false` otherwise
    ///
    /// - Registers:
    ///   - Output: dst
    /// - Iterator Stack: `iterator` **=>** `iterator`
    IteratorDone { dst: RegisterOperand },

    /// Finishes the call to `Opcode::IteratorNext` within a `for await` loop by setting the current
    /// result of the current iterator.
    ///
    /// - Registers:
    ///   - Input: resume_kind, value
    /// - Iterator Stack: `iterator` **=>** `iterator`
    IteratorFinishAsyncNext { resume_kind: RegisterOperand, value: RegisterOperand },

    /// Gets the `value` property of the current iterator record.
    ///
    /// - Registers:
    ///   - Output: dst
    /// - Iterator Stack: `iterator` **=>** `iterator`
    IteratorValue { dst: RegisterOperand },

    /// Gets the last iteration result of the current iterator record.
    ///
    /// - Registers:
    ///   - Output: dst
    /// - Iterator Stack: `iterator` **=>** `iterator`
    IteratorResult { dst: RegisterOperand },

    /// Consume the iterator and construct and array with all the values.
    ///
    /// - Registers:
    ///   - Output: dst
    /// - Iterator Stack: `iterator` **=>** `iterator`
    IteratorToArray { dst: RegisterOperand },

    /// Store `true` in dst if the iterator stack is empty.
    ///
    /// - Registers:
    ///   - Output: dst
    /// - Iterator Stack: **=>**
    IteratorStackEmpty { dst: RegisterOperand },

    /// Creates a new iterator result object.
    ///
    /// - Operands:
    ///   - done: `bool` (codified as u8 with `0` -> `false` and `!0` -> `true`)
    /// - Registers:
    ///   - Input: value
    ///   - Output: value
    CreateIteratorResult { value: RegisterOperand, done: IndexOperand },

    /// Calls `return` on the current iterator and returns the result.
    ///
    /// - Registers:
    ///   - Output: value, called
    /// - Iterator Stack: `iterator` **=>**
    IteratorReturn { value: RegisterOperand, called: RegisterOperand },

    /// Concat multiple stack objects into a string.
    ///
    /// - Registers:
    ///   - Input: values
    ///   - Output: dst
    ConcatToString { dst: RegisterOperand, values: ThinVec<RegisterOperand> },

    /// Require the stack value to be neither null nor undefined.
    ///
    /// - Registers:
    ///   - Input: src
    ValueNotNullOrUndefined { src: RegisterOperand },

    /// Initialize the rest parameter value of a function from the remaining arguments.
    ///
    /// - Stack: `argument_1` .. `argument_n` **=>**
    /// - Registers:
    ///   - Output: dst
    RestParameterInit { dst: RegisterOperand },

    /// Yields from the current generator execution.
    ///
    /// - Registers:
    ///   - Input: src
    ///   - Output: resume_kind, received
    GeneratorYield { src: RegisterOperand },

    /// Yields from the current async generator execution.
    ///
    /// - Registers:
    ///   - Input: src
    ///   - Output: resume_kind, received
    AsyncGeneratorYield { src: RegisterOperand },

    /// Create a promise capacity for an async function, if not already set.
    CreatePromiseCapability,

    /// Stops the current async function and schedules it to resume later.
    ///
    /// - Registers:
    ///   - Input: src
    ///   - Output: resume_kind, received
    Await { src: RegisterOperand },

    /// Store the current new target in dst.
    ///
    /// - Registers:
    ///   - Output: dst
    NewTarget { dst: RegisterOperand },

    /// Store the current `import.meta` in dst.
    ///
    /// - Registers:
    ///   - Output: dst
    ImportMeta { dst: RegisterOperand },

    /// Store `true` in the register if the value is an object, or `false` otherwise.
    ///
    /// - Registers:
    ///   - Input: value
    ///   - Output: value
    IsObject { value: RegisterOperand },

    /// Lookup if a tagged template object is cached and skip the creation if it is.
    ///
    /// - Operands:
    ///   - address: `u32`
    ///   - site: `u64`
    /// - Registers:
    ///   - Output: dst
    TemplateLookup { address: Address, site: u64, dst: RegisterOperand },

    /// Create a new tagged template object and cache it.
    ///
    /// - Operands:
    ///   - site: `u64`
    /// - Registers:
    ///   - Inputs: values
    ///   - Output: dst
    TemplateCreate { site: u64, dst: RegisterOperand, values: ThinVec<u32> },

    /// Push a private environment.
    ///
    /// Operands: count: `u32`, count * name_index: `u32`
    ///
    /// - Registers:
    ///   - Input: class, name_indices
    PushPrivateEnvironment { class: RegisterOperand, name_indices: ThinVec<u32> },

    /// Pop a private environment.
    PopPrivateEnvironment,

    /// Creates a mapped `arguments` object.
    ///
    /// Performs [`10.4.4.7 CreateMappedArgumentsObject ( func, formals, argumentsList, env )`]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-createunmappedargumentsobject
    ///
    /// - Registers:
    ///   - Output: dst
    CreateMappedArgumentsObject { dst: RegisterOperand },

    /// Creates an unmapped `arguments` object.
    ///
    /// Performs: [`10.4.4.6 CreateUnmappedArgumentsObject ( argumentsList )`]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-createmappedargumentsobject
    ///
    /// - Registers:
    ///   - Output: dst
    CreateUnmappedArgumentsObject { dst: RegisterOperand },

    /// Reserved [`Opcode`].
    Reserved1 => Reserved,
    /// Reserved [`Opcode`].
    Reserved2 => Reserved,
    /// Reserved [`Opcode`].
    Reserved3 => Reserved,
    /// Reserved [`Opcode`].
    Reserved4 => Reserved,
    /// Reserved [`Opcode`].
    Reserved5 => Reserved,
    /// Reserved [`Opcode`].
    Reserved6 => Reserved,
    /// Reserved [`Opcode`].
    Reserved7 => Reserved,
    /// Reserved [`Opcode`].
    Reserved8 => Reserved,
    /// Reserved [`Opcode`].
    Reserved9 => Reserved,
    /// Reserved [`Opcode`].
    Reserved10 => Reserved,
    /// Reserved [`Opcode`].
    Reserved11 => Reserved,
    /// Reserved [`Opcode`].
    Reserved12 => Reserved,
    /// Reserved [`Opcode`].
    Reserved13 => Reserved,
    /// Reserved [`Opcode`].
    Reserved14 => Reserved,
    /// Reserved [`Opcode`].
    Reserved15 => Reserved,
    /// Reserved [`Opcode`].
    Reserved16 => Reserved,
    /// Reserved [`Opcode`].
    Reserved17 => Reserved,
    /// Reserved [`Opcode`].
    Reserved18 => Reserved,
    /// Reserved [`Opcode`].
    Reserved19 => Reserved,
    /// Reserved [`Opcode`].
    Reserved20 => Reserved,
    /// Reserved [`Opcode`].
    Reserved21 => Reserved,
    /// Reserved [`Opcode`].
    Reserved22 => Reserved,
    /// Reserved [`Opcode`].
    Reserved23 => Reserved,
    /// Reserved [`Opcode`].
    Reserved24 => Reserved,
    /// Reserved [`Opcode`].
    Reserved25 => Reserved,
    /// Reserved [`Opcode`].
    Reserved26 => Reserved,
    /// Reserved [`Opcode`].
    Reserved27 => Reserved,
    /// Reserved [`Opcode`].
    Reserved28 => Reserved,
    /// Reserved [`Opcode`].
    Reserved29 => Reserved,
    /// Reserved [`Opcode`].
    Reserved30 => Reserved,
    /// Reserved [`Opcode`].
    Reserved31 => Reserved,
    /// Reserved [`Opcode`].
    Reserved32 => Reserved,
    /// Reserved [`Opcode`].
    Reserved33 => Reserved,
    /// Reserved [`Opcode`].
    Reserved34 => Reserved,
    /// Reserved [`Opcode`].
    Reserved35 => Reserved,
    /// Reserved [`Opcode`].
    Reserved36 => Reserved,
    /// Reserved [`Opcode`].
    Reserved37 => Reserved,
    /// Reserved [`Opcode`].
    Reserved38 => Reserved,
    /// Reserved [`Opcode`].
    Reserved39 => Reserved,
    /// Reserved [`Opcode`].
    Reserved40 => Reserved,
    /// Reserved [`Opcode`].
    Reserved41 => Reserved,
    /// Reserved [`Opcode`].
    Reserved42 => Reserved,
    /// Reserved [`Opcode`].
    Reserved43 => Reserved,
    /// Reserved [`Opcode`].
    Reserved44 => Reserved,
    /// Reserved [`Opcode`].
    Reserved45 => Reserved,
    /// Reserved [`Opcode`].
    Reserved46 => Reserved,
    /// Reserved [`Opcode`].
    Reserved47 => Reserved,
    /// Reserved [`Opcode`].
    Reserved48 => Reserved,
    /// Reserved [`Opcode`].
    Reserved49 => Reserved,
    /// Reserved [`Opcode`].
    Reserved50 => Reserved,
    /// Reserved [`Opcode`].
    Reserved51 => Reserved,
    /// Reserved [`Opcode`].
    Reserved52 => Reserved,
    /// Reserved [`Opcode`].
    Reserved53 => Reserved,
    /// Reserved [`Opcode`].
    Reserved54 => Reserved,
    /// Reserved [`Opcode`].
    Reserved55 => Reserved,
    /// Reserved [`Opcode`].
    Reserved56 => Reserved,
    /// Reserved [`Opcode`].
    Reserved57 => Reserved,
    /// Reserved [`Opcode`].
    Reserved58 => Reserved,
    /// Reserved [`Opcode`].
    Reserved59 => Reserved,
    /// Declare `var` type variable during eval declaration instantiation.
    ///
    /// - Operands:
    ///   - binding_index: `IndexOperand`
    DefEvalVar { binding_index: IndexOperand },
}
