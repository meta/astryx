//! Lowering for ECMAScript expressions.
//!
//! The functions in this module implement the bytecompiler side of expression evaluation. They
//! preserve the source language evaluation order while translating AST nodes into opcode sequences
//! that the VM can execute later. See the ECMAScript expression grammar and runtime semantics in
//! the [specification][spec].
//!
//! [spec]: https://tc39.es/ecma262/#sec-ecmascript-language-expressions

mod assign;
mod binary;
mod object_literal;
mod unary;
mod update;

use std::ops::Deref;

use super::{Access, CallResultDest, Callable, NodeKind, Register, ToJsString};
use crate::{
    bytecompiler::{ByteCompiler, Literal},
    vm::{CallFrame, GeneratorResumeKind},
};
use boa_ast::{
    Expression,
    expression::{
        ImportPhase,
        access::{PropertyAccess, PropertyAccessField},
        literal::{
            Literal as AstLiteral, LiteralKind as AstLiteralKind, TemplateElement, TemplateLiteral,
        },
        operator::Conditional,
    },
};
use thin_vec::ThinVec;

impl ByteCompiler<'_> {
    fn compile_literal(&mut self, lit: &AstLiteral, dst: &Register) {
        match lit.kind() {
            AstLiteralKind::String(v) => {
                self.emit_store_literal(Literal::String(v.to_js_string(self.interner())), dst);
            }
            AstLiteralKind::Int(v) => self.emit_store_integer(*v, dst),
            AstLiteralKind::Num(v) => self.emit_store_rational(*v, dst),
            AstLiteralKind::BigInt(v) => {
                self.emit_store_literal(Literal::BigInt(v.clone().into()), dst);
            }
            AstLiteralKind::Bool(true) => self.bytecode.emit_store_true(dst.variable()),
            AstLiteralKind::Bool(false) => self.bytecode.emit_store_false(dst.variable()),
            AstLiteralKind::Null => self.bytecode.emit_store_null(dst.variable()),
            AstLiteralKind::Undefined => self.bytecode.emit_store_undefined(dst.variable()),
        }
    }

    fn compile_conditional(&mut self, op: &Conditional, dst: &Register) {
        self.compile_if_else(
            op.condition(),
            |compiler| compiler.compile_expr(op.if_true(), dst),
            |compiler| compiler.compile_expr(op.if_false(), dst),
        );
    }

    fn compile_template_literal(&mut self, template_literal: &TemplateLiteral, dst: &Register) {
        let mut registers = Vec::with_capacity(template_literal.elements().len());
        for element in template_literal.elements() {
            let value = self.register_allocator.alloc();
            match element {
                TemplateElement::String(s) => {
                    self.emit_store_literal(
                        Literal::String(s.to_js_string(self.interner())),
                        &value,
                    );
                }
                TemplateElement::Expr(expr) => {
                    self.compile_expr(expr, &value);
                }
            }
            registers.push(value);
        }

        let mut values = ThinVec::with_capacity(registers.len());
        for reg in &registers {
            values.push(reg.variable());
        }
        self.bytecode.emit_concat_to_string(dst.variable(), values);
        for reg in registers {
            self.register_allocator.dealloc(reg);
        }
    }

    pub(crate) fn compile_expr_impl(&mut self, expr: &Expression, dst: &Register) {
        match expr {
            Expression::Literal(lit) => self.compile_literal(lit, dst),
            Expression::RegExpLiteral(regexp) => {
                let pattern_index = self.get_or_insert_name(regexp.pattern());
                let flags_index = self.get_or_insert_name(regexp.flags());
                self.bytecode.emit_store_regexp(
                    dst.variable(),
                    pattern_index.into(),
                    flags_index.into(),
                );
            }
            Expression::Unary(unary) => self.compile_unary(unary, dst),
            Expression::Update(update) => self.compile_update(update, dst, false),
            Expression::Binary(binary) => self.compile_binary(binary, dst),
            Expression::BinaryInPrivate(binary) => self.compile_binary_in_private(binary, dst),
            Expression::Assign(assign) => self.compile_assign(assign, dst),
            Expression::ObjectLiteral(object) => self.compile_object_literal(object, dst),
            Expression::Identifier(name) => self.access_get(Access::Variable { name: *name }, dst),
            Expression::PropertyAccess(access) => self.access_get(Access::Property { access }, dst),
            Expression::Conditional(op) => self.compile_conditional(op, dst),
            Expression::ArrayLiteral(literal) => {
                let dst_op = dst.variable();
                self.bytecode.emit_store_new_array(dst_op);

                for element in literal.as_ref() {
                    match element {
                        Some(Expression::Spread(spread)) => {
                            let value = self.register_allocator.alloc();
                            self.compile_expr(spread.target(), &value);
                            self.bytecode.emit_get_iterator(value.variable());
                            let t = self.v8_not_iterable(spread.target(), crate::bytecompiler::IterSite::ArraySpread);
                            self.note_v8('I', t);
                            self.bytecode.emit_push_iterator_to_array(dst_op);
                            self.register_allocator.dealloc(value);
                        }
                        Some(elem) => {
                            self.compile_expr_operand(elem, |this, op| {
                                this.bytecode.emit_push_value_to_array(op, dst_op);
                            });
                        }
                        None => {
                            self.bytecode.emit_push_elision_to_array(dst_op);
                        }
                    }
                }
            }
            Expression::This(_this) => self.access_get(Access::This, dst),
            Expression::Spread(spread) => self.compile_expr(spread.target(), dst),
            Expression::FunctionExpression(function) => {
                self.function_with_binding(function.into(), NodeKind::Expression, dst);
            }
            Expression::ArrowFunction(function) => {
                self.function_with_binding(function.into(), NodeKind::Expression, dst);
            }
            Expression::AsyncArrowFunction(function) => {
                self.function_with_binding(function.into(), NodeKind::Expression, dst);
            }
            Expression::GeneratorExpression(function) => {
                self.function_with_binding(function.into(), NodeKind::Expression, dst);
            }
            Expression::AsyncFunctionExpression(function) => {
                self.function_with_binding(function.into(), NodeKind::Expression, dst);
            }
            Expression::AsyncGeneratorExpression(function) => {
                self.function_with_binding(function.into(), NodeKind::Expression, dst);
            }
            Expression::Call(call) => {
                self.call(Callable::Call(call), CallResultDest::Register(dst));
            }
            Expression::New(new) => {
                self.call(Callable::New(new), CallResultDest::Register(dst));
            }
            Expression::TemplateLiteral(template_literal) => {
                self.compile_template_literal(template_literal, dst);
            }
            Expression::Await(expr) => {
                self.compile_expr(expr.target(), dst);
                self.bytecode.emit_await(dst.variable());
                let resume_kind = self.register_allocator.alloc();
                self.pop_into_register(&resume_kind);
                self.pop_into_register(dst);
                self.generator_next(dst, &resume_kind);
                self.register_allocator.dealloc(resume_kind);
            }
            Expression::Yield(r#yield) => {
                if let Some(expr) = r#yield.target() {
                    self.compile_expr(expr, dst);
                } else {
                    self.bytecode.emit_store_undefined(dst.variable());
                }

                if !r#yield.delegate() {
                    self.r#yield(dst);
                    return;
                }

                // need to delegate to an inner iterator

                if self.is_async() {
                    self.bytecode.emit_get_async_iterator(dst.variable());
                } else {
                    self.bytecode.emit_get_iterator(dst.variable());
                }

                let resume_kind = self.register_allocator.alloc();
                let is_return = self.register_allocator.alloc();
                self.bytecode.emit_store_undefined(dst.variable());
                self.emit_resume_kind(GeneratorResumeKind::Normal, &resume_kind);

                let start_address = self.next_opcode_location();

                let (return_method_undefined, throw_method_undefined) =
                    self.generator_delegate_next(dst, &resume_kind, &is_return);

                if self.is_async() {
                    self.bytecode.emit_await(dst.variable());
                    self.pop_into_register(&resume_kind);
                    self.pop_into_register(dst);
                } else {
                    self.emit_resume_kind(GeneratorResumeKind::Normal, &resume_kind);
                }

                let (resume_return, resume_exit) =
                    self.generator_delegate_resume(dst, &resume_kind, &is_return);

                if self.is_async() {
                    self.bytecode.emit_iterator_value(dst.variable());
                    self.async_generator_yield(dst, &resume_kind);
                } else {
                    self.bytecode.emit_iterator_result(dst.variable());
                    self.bytecode.emit_generator_yield(dst.variable());
                    self.pop_into_register(&resume_kind);
                    self.pop_into_register(dst);
                }
                self.bytecode.emit_jump(start_address);

                self.register_allocator.dealloc(resume_kind);
                self.register_allocator.dealloc(is_return);

                self.patch_jump(return_method_undefined);
                self.patch_jump(resume_return);

                if self.is_async() {
                    self.bytecode.emit_await(dst.variable());
                    self.bytecode.emit_pop();
                } else {
                    self.push_from_register(dst);
                }
                self.close_active_iterators();

                self.r#return(true);

                self.patch_jump(throw_method_undefined);

                self.iterator_close(self.is_async());
                self.emit_type_error("iterator does not have a throw method");

                self.patch_jump(resume_exit);
            }
            Expression::TaggedTemplate(template) => {
                let this = self.register_allocator.alloc();
                let function = self.register_allocator.alloc();

                match template.tag() {
                    Expression::PropertyAccess(PropertyAccess::Simple(access)) => {
                        self.compile_expr(access.target(), &this);
                        match access.field() {
                            PropertyAccessField::Const(ident) => {
                                self.emit_get_property_by_name(&function, None, &this, ident.sym());
                            }
                            PropertyAccessField::Expr(field) => {
                                let key = self.register_allocator.alloc();
                                self.compile_expr(field, &key);
                                self.bytecode.emit_get_property_by_value(
                                    function.variable(),
                                    key.variable(),
                                    this.variable(),
                                    this.variable(),
                                );
                                self.register_allocator.dealloc(key);
                            }
                        }
                    }
                    Expression::PropertyAccess(PropertyAccess::Private(access)) => {
                        let index = self.get_or_insert_private_name(access.field());
                        self.compile_expr(access.target(), &this);
                        self.bytecode.emit_get_private_field(
                            function.variable(),
                            this.variable(),
                            index.into(),
                        );
                    }
                    expr => {
                        self.bytecode.emit_store_undefined(this.variable());
                        self.compile_expr(expr, &function);
                    }
                }

                self.push_from_register(&this);
                self.push_from_register(&function);

                self.register_allocator.dealloc(this);
                self.register_allocator.dealloc(function);

                let site = template.identifier();
                let count = template.cookeds().len() as u32;
                let jump_label = self.template_lookup(dst, site);

                let mut part_registers = Vec::with_capacity(count as usize * 2);

                for (cooked, raw) in template.cookeds().iter().zip(template.raws()) {
                    let value = self.register_allocator.alloc();
                    if let Some(cooked) = cooked {
                        self.emit_store_literal(
                            Literal::String(cooked.to_js_string(self.interner())),
                            &value,
                        );
                    } else {
                        self.bytecode.emit_store_undefined(value.variable());
                    }
                    part_registers.push(value);
                    let value = self.register_allocator.alloc();
                    self.emit_store_literal(
                        Literal::String(raw.to_js_string(self.interner())),
                        &value,
                    );
                    part_registers.push(value);
                }

                let mut values = ThinVec::with_capacity(count as usize * 2);
                for r in &part_registers {
                    values.push(r.index());
                }
                self.bytecode
                    .emit_template_create(site, dst.variable(), values);
                for r in part_registers {
                    self.register_allocator.dealloc(r);
                }

                self.patch_jump(jump_label);
                self.push_from_register(dst);

                for expr in template.exprs() {
                    self.compile_expr_to_stack(expr);
                }

                self.bytecode
                    .emit_call((template.exprs().len() as u32 + 1).into());
                let t = self.v8_not_callable(template.tag(), false);
                self.note_v8('C', t);
                self.pop_into_register(dst);
            }
            Expression::ClassExpression(class) => {
                self.compile_class(class.deref().into(), Some(dst));
            }
            Expression::SuperCall(super_call) => {
                let value = self.register_allocator.alloc();

                self.bytecode.emit_get_function_object(value.variable());
                self.bytecode.emit_get_prototype(value.variable());

                self.push_from_register(&CallFrame::undefined_register());
                self.push_from_register(&value);
                self.register_allocator.dealloc(value);

                let contains_spread = super_call
                    .arguments()
                    .iter()
                    .any(|arg| matches!(arg, Expression::Spread(_)));

                if contains_spread {
                    let array = self.register_allocator.alloc();
                    let array_op = array.variable();

                    self.bytecode.emit_store_new_array(array_op);

                    for arg in super_call.arguments() {
                        if let Expression::Spread(spread) = arg {
                            let value = self.register_allocator.alloc();
                            self.compile_expr(spread.target(), &value);
                            self.bytecode.emit_get_iterator(value.variable());
                            self.bytecode.emit_push_iterator_to_array(array_op);
                            self.register_allocator.dealloc(value);
                        } else {
                            self.compile_expr_operand(arg, |this, op| {
                                this.bytecode.emit_push_value_to_array(op, array_op);
                            });
                        }
                    }

                    self.push_from_register(&array);
                    self.register_allocator.dealloc(array);
                } else {
                    for arg in super_call.arguments() {
                        self.compile_expr_to_stack(arg);
                    }
                }

                if contains_spread {
                    self.bytecode.emit_super_call_spread();
                } else {
                    self.bytecode
                        .emit_super_call((super_call.arguments().len() as u32).into());
                }
                self.pop_into_register(dst);
                self.bytecode.emit_bind_this_value(dst.variable());
            }
            Expression::ImportCall(import) => {
                self.compile_expr(import.specifier(), dst);
                let options = self.register_allocator.alloc();
                if let Some(opts) = import.options() {
                    self.compile_expr(opts, &options);
                } else {
                    self.bytecode.emit_store_undefined(options.variable());
                }

                let phase: u32 = match import.phase() {
                    ImportPhase::Evaluation => 0,
                    ImportPhase::Defer => 1,
                    ImportPhase::Source => 2,
                };
                self.bytecode
                    .emit_import_call(dst.variable(), options.variable(), phase.into());
                self.register_allocator.dealloc(options);
            }
            Expression::NewTarget(_new_target) => {
                self.bytecode.emit_new_target(dst.variable());
            }
            Expression::ImportMeta(_import_meta) => {
                self.bytecode.emit_import_meta(dst.variable());
            }
            Expression::Optional(opt) => {
                let this = self.register_allocator.alloc();
                self.compile_optional_preserve_this(opt, &this, dst);
                self.register_allocator.dealloc(this);
            }
            Expression::Parenthesized(parenthesized) => {
                self.compile_expr(parenthesized.expression(), dst);
            }
        }
    }
}
