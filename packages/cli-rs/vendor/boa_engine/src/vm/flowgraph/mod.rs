//! This module is responsible for generating the vm instruction flowgraph.

use crate::vm::CodeBlock;

mod color;
mod edge;
mod graph;
mod node;

use boa_macros::js_str;
pub use color::*;
pub use edge::*;
pub use graph::*;
pub use node::*;

use super::{
    Constant,
    opcode::{Instruction, InstructionIterator},
};

impl CodeBlock {
    /// Output the [`CodeBlock`] VM instructions into a [`Graph`].
    #[allow(clippy::match_same_arms)]
    pub fn to_graph(&self, graph: &mut SubGraph) {
        // Have to remove any invalid graph chars like `<` or `>`.
        let name = if self.name() == &js_str!("<main>") {
            "__main__".to_string()
        } else {
            self.name().to_std_string_escaped()
        };

        graph.set_label(name);

        let mut iterator = InstructionIterator::new(&self.bytecode);
        while let Some((previous_pc, opcode, instruction)) = iterator.next() {
            let opcode_str = opcode.as_str();

            let label = format!("{opcode_str} {}", self.instruction_operands(&instruction));

            let pc = iterator.pc();

            match instruction {
                Instruction::StrictEq { .. }
                | Instruction::StrictNotEq { .. }
                | Instruction::SetRegisterFromAccumulator { .. }
                | Instruction::Move { .. }
                | Instruction::PopIntoRegister { .. }
                | Instruction::PushFromRegister { .. }
                | Instruction::Add { .. }
                | Instruction::Sub { .. }
                | Instruction::Div { .. }
                | Instruction::Mul { .. }
                | Instruction::Mod { .. }
                | Instruction::Pow { .. }
                | Instruction::ShiftRight { .. }
                | Instruction::ShiftLeft { .. }
                | Instruction::UnsignedShiftRight { .. }
                | Instruction::BitOr { .. }
                | Instruction::BitAnd { .. }
                | Instruction::BitXor { .. }
                | Instruction::BitNot { .. }
                | Instruction::In { .. }
                | Instruction::Eq { .. }
                | Instruction::NotEq { .. }
                | Instruction::GreaterThan { .. }
                | Instruction::GreaterThanOrEq { .. }
                | Instruction::LessThan { .. }
                | Instruction::LessThanOrEq { .. }
                | Instruction::InstanceOf { .. }
                | Instruction::SetAccumulator { .. }
                | Instruction::SetFunctionName { .. }
                | Instruction::Inc { .. }
                | Instruction::Dec { .. }
                | Instruction::CreateIteratorResult { .. }
                | Instruction::Generator
                | Instruction::AsyncGenerator
                | Instruction::StoreInt8 { .. }
                | Instruction::StoreInt16 { .. }
                | Instruction::StoreInt32 { .. }
                | Instruction::StoreFloat { .. }
                | Instruction::StoreDouble { .. }
                | Instruction::StoreLiteral { .. }
                | Instruction::StoreRegexp { .. } => {
                    graph.add_node(previous_pc, NodeShape::None, label.into(), Color::None);
                    graph.add_edge(previous_pc, pc, None, Color::None, EdgeStyle::Line);
                }
                Instruction::Jump { address } => {
                    graph.add_node(previous_pc, NodeShape::Diamond, label.into(), Color::None);
                    graph.add_edge(
                        previous_pc,
                        address.as_u32() as usize,
                        None,
                        Color::None,
                        EdgeStyle::Line,
                    );
                }
                Instruction::JumpIfFalse { address, .. }
                | Instruction::JumpIfTrue { address, .. }
                | Instruction::JumpIfNotUndefined { address, .. }
                | Instruction::JumpIfNullOrUndefined { address, .. }
                | Instruction::JumpIfNotLessThan { address, .. }
                | Instruction::JumpIfNotLessThanOrEqual { address, .. }
                | Instruction::JumpIfNotGreaterThan { address, .. }
                | Instruction::JumpIfNotGreaterThanOrEqual { address, .. }
                | Instruction::JumpIfNotEqual { address, .. } => {
                    graph.add_node(previous_pc, NodeShape::Diamond, label.into(), Color::None);
                    graph.add_edge(
                        previous_pc,
                        address.as_u32() as usize,
                        Some("YES".into()),
                        Color::Green,
                        EdgeStyle::Line,
                    );
                    graph.add_edge(
                        previous_pc,
                        pc,
                        Some("NO".into()),
                        Color::Red,
                        EdgeStyle::Line,
                    );
                }
                Instruction::TemplateLookup { .. } | Instruction::TemplateCreate { .. } => {
                    graph.add_node(previous_pc, NodeShape::None, label.into(), Color::Red);
                    graph.add_edge(previous_pc, pc, None, Color::None, EdgeStyle::Line);
                }
                Instruction::LogicalAnd { address, .. }
                | Instruction::LogicalOr { address, .. }
                | Instruction::Coalesce { address, .. } => {
                    graph.add_node(previous_pc, NodeShape::None, label.into(), Color::None);
                    graph.add_edge(previous_pc, pc, None, Color::None, EdgeStyle::Line);
                    graph.add_edge(
                        previous_pc,
                        address.as_u32() as usize,
                        Some("SHORT CIRCUIT".into()),
                        Color::Red,
                        EdgeStyle::Line,
                    );
                }
                Instruction::Case { address, .. } => {
                    graph.add_node(previous_pc, NodeShape::None, label.into(), Color::None);
                    graph.add_edge(
                        previous_pc,
                        pc,
                        Some("NO".into()),
                        Color::Red,
                        EdgeStyle::Line,
                    );
                    graph.add_edge(
                        previous_pc,
                        address.as_u32() as usize,
                        Some("YES".into()),
                        Color::Green,
                        EdgeStyle::Line,
                    );
                }
                Instruction::CallEval { .. }
                | Instruction::Call { .. }
                | Instruction::New { .. }
                | Instruction::SuperCall { .. }
                | Instruction::ConcatToString { .. }
                | Instruction::GetArgument { .. } => {
                    graph.add_node(previous_pc, NodeShape::None, label.into(), Color::None);
                    graph.add_edge(previous_pc, pc, None, Color::None, EdgeStyle::Line);
                }
                Instruction::CopyDataProperties { .. } => {
                    graph.add_node(previous_pc, NodeShape::None, label.into(), Color::None);
                    graph.add_edge(previous_pc, pc, None, Color::None, EdgeStyle::Line);
                }
                Instruction::PushScope { .. } => {
                    let random = rand::random();

                    graph.add_node(
                        previous_pc,
                        NodeShape::None,
                        label.into(),
                        Color::from_random_number(random),
                    );
                    graph.add_edge(previous_pc, pc, None, Color::None, EdgeStyle::Line);
                }
                Instruction::PopEnvironment => {
                    graph.add_node(previous_pc, NodeShape::None, label.into(), Color::None);
                    graph.add_edge(previous_pc, pc, None, Color::None, EdgeStyle::Line);
                }
                Instruction::GetFunction { .. } => {
                    graph.add_node(previous_pc, NodeShape::None, label.into(), Color::None);
                    graph.add_edge(previous_pc, pc, None, Color::None, EdgeStyle::Line);
                }
                Instruction::DefVar { .. }
                | Instruction::DefEvalVar { .. }
                | Instruction::DefInitVar { .. }
                | Instruction::PutLexicalValue { .. }
                | Instruction::GetName { .. }
                | Instruction::GetNameGlobal { .. }
                | Instruction::GetLocator { .. }
                | Instruction::GetNameAndLocator { .. }
                | Instruction::GetNameOrUndefined { .. }
                | Instruction::SetName { .. }
                | Instruction::DeleteName { .. } => {
                    graph.add_node(previous_pc, NodeShape::None, label.into(), Color::None);
                    graph.add_edge(previous_pc, pc, None, Color::None, EdgeStyle::Line);
                }
                Instruction::GetPropertyByNameWithThis { .. }
                | Instruction::GetLengthProperty { .. }
                | Instruction::GetPropertyByName { .. }
                | Instruction::GetPropertyByValue { .. }
                | Instruction::GetPropertyByValuePush { .. }
                | Instruction::SetPropertyByName { .. }
                | Instruction::SetPropertyByNameWithThis { .. }
                | Instruction::DefineOwnPropertyByName { .. }
                | Instruction::DefineClassStaticMethodByName { .. }
                | Instruction::DefineClassMethodByName { .. }
                | Instruction::SetPropertyGetterByName { .. }
                | Instruction::DefineClassStaticGetterByName { .. }
                | Instruction::DefineClassGetterByName { .. }
                | Instruction::SetPropertySetterByName { .. }
                | Instruction::DefineClassStaticSetterByName { .. }
                | Instruction::DefineClassSetterByName { .. }
                | Instruction::SetPrivateField { .. }
                | Instruction::DefinePrivateField { .. }
                | Instruction::SetPrivateMethod { .. }
                | Instruction::SetPrivateSetter { .. }
                | Instruction::SetPrivateGetter { .. }
                | Instruction::GetPrivateField { .. }
                | Instruction::DeletePropertyByName { .. }
                | Instruction::PushClassFieldPrivate { .. }
                | Instruction::PushClassPrivateGetter { .. }
                | Instruction::PushClassPrivateSetter { .. }
                | Instruction::PushClassPrivateMethod { .. }
                | Instruction::InPrivate { .. }
                | Instruction::ThrowMutateImmutable { .. } => {
                    graph.add_node(previous_pc, NodeShape::None, label.into(), Color::None);
                    graph.add_edge(previous_pc, pc, None, Color::None, EdgeStyle::Line);
                }
                Instruction::ThrowNewTypeError { .. }
                | Instruction::ThrowNewReferenceError { .. } => {
                    graph.add_node(previous_pc, NodeShape::None, label.into(), Color::None);
                    if let Some((i, handler)) = self.find_handler(previous_pc as u32) {
                        graph.add_edge(
                            previous_pc,
                            handler.handler().as_u32() as usize,
                            Some(format!("Handler {i:2}: CAUGHT").into()),
                            Color::None,
                            EdgeStyle::Line,
                        );
                    }
                }
                Instruction::Throw { .. } | Instruction::ReThrow => {
                    if let Some((i, handler)) = self.find_handler(previous_pc as u32) {
                        graph.add_node(previous_pc, NodeShape::Record, label.into(), Color::None);
                        graph.add_edge(
                            previous_pc,
                            handler.handler().as_u32() as usize,
                            Some(format!("Handler {i:2}: CAUGHT").into()),
                            Color::None,
                            EdgeStyle::Line,
                        );
                    } else {
                        graph.add_node(previous_pc, NodeShape::Diamond, label.into(), Color::None);
                    }
                }
                Instruction::PushPrivateEnvironment { .. } => {
                    graph.add_node(previous_pc, NodeShape::None, label.into(), Color::None);
                    graph.add_edge(previous_pc, pc, None, Color::None, EdgeStyle::Line);
                }
                Instruction::JumpTable {
                    index: _,
                    addresses,
                } => {
                    graph.add_node(previous_pc, NodeShape::None, label.into(), Color::None);

                    graph.add_edge(
                        previous_pc,
                        pc,
                        Some("DEFAULT".into()),
                        Color::None,
                        EdgeStyle::Line,
                    );

                    for (i, address) in addresses.iter().enumerate() {
                        graph.add_edge(
                            previous_pc,
                            address.as_u32() as usize,
                            Some(format!("{i}").into()),
                            Color::None,
                            EdgeStyle::Line,
                        );
                    }
                }
                Instruction::Pop
                | Instruction::StoreZero { .. }
                | Instruction::StoreOne { .. }
                | Instruction::StoreNan { .. }
                | Instruction::StorePositiveInfinity { .. }
                | Instruction::StoreNegativeInfinity { .. }
                | Instruction::StoreNull { .. }
                | Instruction::StoreTrue { .. }
                | Instruction::StoreFalse { .. }
                | Instruction::StoreUndefined { .. }
                | Instruction::StoreEmptyObject { .. }
                | Instruction::StoreClassPrototype { .. }
                | Instruction::SetClassPrototype { .. }
                | Instruction::SetHomeObject { .. }
                | Instruction::GetHomeObject { .. }
                | Instruction::TypeOf { .. }
                | Instruction::LogicalNot { .. }
                | Instruction::Pos { .. }
                | Instruction::Neg { .. }
                | Instruction::SetPropertyByValue { .. }
                | Instruction::DefineOwnPropertyByValue { .. }
                | Instruction::DefineClassStaticMethodByValue { .. }
                | Instruction::DefineClassMethodByValue { .. }
                | Instruction::SetPropertyGetterByValue { .. }
                | Instruction::DefineClassStaticGetterByValue { .. }
                | Instruction::DefineClassGetterByValue { .. }
                | Instruction::SetPropertySetterByValue { .. }
                | Instruction::DefineClassStaticSetterByValue { .. }
                | Instruction::DefineClassSetterByValue { .. }
                | Instruction::DeletePropertyByValue { .. }
                | Instruction::DeleteSuperThrow
                | Instruction::GetMethod { .. }
                | Instruction::ToPropertyKey { .. }
                | Instruction::This { .. }
                | Instruction::ThisForObjectEnvironmentName { .. }
                | Instruction::GetFunctionObject { .. }
                | Instruction::IncrementLoopIteration
                | Instruction::CreateForInIterator { .. }
                | Instruction::GetIterator { .. }
                | Instruction::GetAsyncIterator { .. }
                | Instruction::IteratorNext
                | Instruction::IteratorPop { .. }
                | Instruction::IteratorPush { .. }
                | Instruction::IteratorUpdateResult { .. }
                | Instruction::IteratorFinishAsyncNext { .. }
                | Instruction::IteratorValue { .. }
                | Instruction::IteratorResult { .. }
                | Instruction::IteratorDone { .. }
                | Instruction::IteratorToArray { .. }
                | Instruction::IteratorReturn { .. }
                | Instruction::IteratorStackEmpty { .. }
                | Instruction::ValueNotNullOrUndefined { .. }
                | Instruction::RestParameterInit { .. }
                | Instruction::PushValueToArray { .. }
                | Instruction::PushElisionToArray { .. }
                | Instruction::PushIteratorToArray { .. }
                | Instruction::StoreNewArray { .. }
                | Instruction::GeneratorYield { .. }
                | Instruction::AsyncGeneratorYield { .. }
                | Instruction::AsyncGeneratorClose
                | Instruction::CreatePromiseCapability
                | Instruction::PushClassField { .. }
                | Instruction::SuperCallDerived
                | Instruction::Await { .. }
                | Instruction::NewTarget { .. }
                | Instruction::ImportMeta { .. }
                | Instruction::CallEvalSpread { .. }
                | Instruction::CallSpread
                | Instruction::NewSpread
                | Instruction::SuperCallSpread
                | Instruction::SetPrototype { .. }
                | Instruction::GetPrototype { .. }
                | Instruction::IsObject { .. }
                | Instruction::SetNameByLocator { .. }
                | Instruction::PushObjectEnvironment { .. }
                | Instruction::PopPrivateEnvironment
                | Instruction::ImportCall { .. }
                | Instruction::Exception { .. }
                | Instruction::MaybeException { .. }
                | Instruction::CheckReturn
                | Instruction::BindThisValue { .. }
                | Instruction::CreateMappedArgumentsObject { .. }
                | Instruction::CreateUnmappedArgumentsObject { .. } => {
                    graph.add_node(previous_pc, NodeShape::None, label.into(), Color::None);
                    graph.add_edge(previous_pc, pc, None, Color::None, EdgeStyle::Line);
                }
                Instruction::Return => {
                    graph.add_node(previous_pc, NodeShape::Diamond, label.into(), Color::Red);
                }
                Instruction::Reserved1
                | Instruction::Reserved2
                | Instruction::Reserved3
                | Instruction::Reserved4
                | Instruction::Reserved5
                | Instruction::Reserved6
                | Instruction::Reserved7
                | Instruction::Reserved8
                | Instruction::Reserved9
                | Instruction::Reserved10
                | Instruction::Reserved11
                | Instruction::Reserved12
                | Instruction::Reserved13
                | Instruction::Reserved14
                | Instruction::Reserved15
                | Instruction::Reserved16
                | Instruction::Reserved17
                | Instruction::Reserved18
                | Instruction::Reserved19
                | Instruction::Reserved20
                | Instruction::Reserved21
                | Instruction::Reserved22
                | Instruction::Reserved23
                | Instruction::Reserved24
                | Instruction::Reserved25
                | Instruction::Reserved26
                | Instruction::Reserved27
                | Instruction::Reserved28
                | Instruction::Reserved29
                | Instruction::Reserved30
                | Instruction::Reserved31
                | Instruction::Reserved32
                | Instruction::Reserved33
                | Instruction::Reserved34
                | Instruction::Reserved35
                | Instruction::Reserved36
                | Instruction::Reserved37
                | Instruction::Reserved38
                | Instruction::Reserved39
                | Instruction::Reserved40
                | Instruction::Reserved41
                | Instruction::Reserved42
                | Instruction::Reserved43
                | Instruction::Reserved44
                | Instruction::Reserved45
                | Instruction::Reserved46
                | Instruction::Reserved47
                | Instruction::Reserved48
                | Instruction::Reserved49
                | Instruction::Reserved50
                | Instruction::Reserved51
                | Instruction::Reserved52
                | Instruction::Reserved53
                | Instruction::Reserved54
                | Instruction::Reserved55
                | Instruction::Reserved56
                | Instruction::Reserved57
                | Instruction::Reserved58
                | Instruction::Reserved59 => unreachable!("Reserved opcodes are unreachable"),
            }
        }

        for constant in &self.constants {
            if let Constant::Function(function) = constant {
                let subgraph = graph.subgraph(String::new());
                function.to_graph(subgraph);
            }
        }
    }
}
