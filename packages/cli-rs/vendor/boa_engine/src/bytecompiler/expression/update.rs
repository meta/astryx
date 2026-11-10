use crate::bytecompiler::{
    Access, BindingAccessOpcode, BindingKind, ByteCompiler, Register, ToJsString,
};
use boa_ast::{
    expression::{
        access::{PropertyAccess, PropertyAccessField},
        operator::{Update, update::UpdateOp},
    },
    scope::BindingLocatorError,
};

impl ByteCompiler<'_> {
    pub(crate) fn compile_update(&mut self, update: &Update, dst: &Register, discard: bool) {
        let mut compiler = self.position_guard(update);
        let increment = matches!(
            update.op(),
            UpdateOp::IncrementPost | UpdateOp::IncrementPre
        );
        let post = matches!(
            update.op(),
            UpdateOp::IncrementPost | UpdateOp::DecrementPost
        );

        match Access::from_update_target(update.target()) {
            Access::Variable { name } => {
                let name = name.to_js_string(compiler.interner());
                let binding = compiler
                    .lexical_scope
                    .get_identifier_reference(name.clone());
                let is_lexical = binding.is_lexical();
                let index = compiler.get_binding(&binding);

                // Fast path: for mutable local bindings with (post/pre)-increment/decrement,
                // use the local register directly to avoid unnecessary Move instructions.
                //
                // Pre-increment (++i):
                //   Inc(dst, local); Move(local, dst) → 2 ops
                //
                // Post-increment (i++):
                //   Move(dst, local); Inc(local, local) → 2 ops
                //
                // Inc(local, local) works because Inc writes new to dst AFTER old to src,
                // so when dst==src the new value wins.
                //
                // Skip for const bindings — they must fall through to emit ThrowMutateImmutable.
                if is_lexical
                    && compiler
                        .lexical_scope
                        .set_mutable_binding(name.clone())
                        .is_ok()
                    && let BindingKind::Local(Some(local_reg)) = &index
                {
                    let local_op = (*local_reg).into();

                    if discard {
                        // Result unused — just increment in-place.
                        if increment {
                            compiler.bytecode.emit_inc(local_op, local_op);
                        } else {
                            compiler.bytecode.emit_dec(local_op, local_op);
                        }
                        return;
                    }

                    if post {
                        // Save old value to dst (post-increment returns old value).
                        compiler.bytecode.emit_move(dst.variable(), local_op);
                        // Increment in-place.
                        if increment {
                            compiler.bytecode.emit_inc(local_op, local_op);
                        } else {
                            compiler.bytecode.emit_dec(local_op, local_op);
                        }
                    } else {
                        if increment {
                            compiler.bytecode.emit_inc(dst.variable(), local_op);
                        } else {
                            compiler.bytecode.emit_dec(dst.variable(), local_op);
                        }
                        // Write the new value back to the local register.
                        compiler.bytecode.emit_move(local_op, dst.variable());
                    }
                    return;
                }

                if is_lexical {
                    compiler.emit_binding_access(BindingAccessOpcode::GetName, &index, dst);
                } else {
                    compiler.emit_binding_access(
                        BindingAccessOpcode::GetNameAndLocator,
                        &index,
                        dst,
                    );
                }

                let value = compiler.register_allocator.alloc();
                if increment {
                    compiler.bytecode.emit_inc(value.variable(), dst.variable());
                } else {
                    compiler.bytecode.emit_dec(value.variable(), dst.variable());
                }

                if is_lexical {
                    match compiler.lexical_scope.set_mutable_binding(name.clone()) {
                        Ok(binding) => {
                            let index = compiler.insert_binding(binding);
                            compiler.emit_binding_access(
                                BindingAccessOpcode::SetName,
                                &index,
                                &value,
                            );
                        }
                        Err(BindingLocatorError::MutateImmutable) => {
                            let index = compiler.get_or_insert_string(name);
                            compiler.bytecode.emit_throw_mutate_immutable(index.into());
                        }
                        Err(BindingLocatorError::Silent) => {}
                    }
                } else {
                    compiler.emit_binding_access(
                        BindingAccessOpcode::SetNameByLocator,
                        &index,
                        &value,
                    );
                }
                if !post && !discard {
                    compiler
                        .bytecode
                        .emit_move(dst.variable(), value.variable());
                }

                compiler.register_allocator.dealloc(value);
            }
            Access::Property { access } => match access {
                PropertyAccess::Simple(access) => {
                    let object = compiler.register_allocator.alloc();
                    compiler.compile_expr(access.target(), &object);

                    match access.field() {
                        PropertyAccessField::Const(ident) => {
                            compiler.emit_get_property_by_name(dst, None, &object, ident.sym());
                            let value = compiler.register_allocator.alloc();
                            if increment {
                                compiler.bytecode.emit_inc(value.variable(), dst.variable());
                            } else {
                                compiler.bytecode.emit_dec(value.variable(), dst.variable());
                            }

                            compiler.emit_set_property_by_name(&value, None, &object, ident.sym());

                            if !post {
                                compiler
                                    .bytecode
                                    .emit_move(dst.variable(), value.variable());
                            }

                            compiler.register_allocator.dealloc(object);
                            compiler.register_allocator.dealloc(value);
                        }
                        PropertyAccessField::Expr(expr) => {
                            let key = compiler.register_allocator.alloc();
                            compiler.compile_expr(expr, &key);

                            compiler.bytecode.emit_get_property_by_value_push(
                                dst.variable(),
                                key.variable(),
                                object.variable(),
                                object.variable(),
                            );

                            let value = compiler.register_allocator.alloc();
                            if increment {
                                compiler.bytecode.emit_inc(value.variable(), dst.variable());
                            } else {
                                compiler.bytecode.emit_dec(value.variable(), dst.variable());
                            }

                            compiler.bytecode.emit_set_property_by_value(
                                value.variable(),
                                key.variable(),
                                object.variable(),
                                object.variable(),
                            );

                            if !post {
                                compiler
                                    .bytecode
                                    .emit_move(dst.variable(), value.variable());
                            }

                            compiler.register_allocator.dealloc(key);
                            compiler.register_allocator.dealloc(object);
                            compiler.register_allocator.dealloc(value);
                        }
                    }
                }
                PropertyAccess::Private(access) => {
                    let index = compiler.get_or_insert_private_name(access.field());

                    let object = compiler.register_allocator.alloc();
                    compiler.compile_expr(access.target(), &object);

                    compiler.bytecode.emit_get_private_field(
                        dst.variable(),
                        object.variable(),
                        index.into(),
                    );

                    let value = compiler.register_allocator.alloc();
                    if increment {
                        compiler.bytecode.emit_inc(value.variable(), dst.variable());
                    } else {
                        compiler.bytecode.emit_dec(value.variable(), dst.variable());
                    }
                    compiler.bytecode.emit_set_private_field(
                        value.variable(),
                        object.variable(),
                        index.into(),
                    );

                    if !post {
                        compiler
                            .bytecode
                            .emit_move(dst.variable(), value.variable());
                    }

                    compiler.register_allocator.dealloc(value);
                    compiler.register_allocator.dealloc(object);
                }
                PropertyAccess::Super(access) => match access.field() {
                    PropertyAccessField::Const(ident) => {
                        let object = compiler.register_allocator.alloc();
                        let receiver = compiler.register_allocator.alloc();
                        compiler.super_(&receiver, &object);

                        compiler.emit_get_property_by_name(
                            dst,
                            Some(&receiver),
                            &object,
                            ident.sym(),
                        );

                        let value = compiler.register_allocator.alloc();
                        if increment {
                            compiler.bytecode.emit_inc(value.variable(), dst.variable());
                        } else {
                            compiler.bytecode.emit_dec(value.variable(), dst.variable());
                        }

                        compiler.emit_set_property_by_name(
                            &value,
                            Some(&receiver),
                            &object,
                            ident.sym(),
                        );
                        if !post {
                            compiler
                                .bytecode
                                .emit_move(dst.variable(), value.variable());
                        }

                        compiler.register_allocator.dealloc(receiver);
                        compiler.register_allocator.dealloc(object);
                        compiler.register_allocator.dealloc(value);
                    }
                    PropertyAccessField::Expr(expr) => {
                        let object = compiler.register_allocator.alloc();
                        let receiver = compiler.register_allocator.alloc();
                        compiler.super_(&receiver, &object);

                        let key = compiler.register_allocator.alloc();
                        compiler.compile_expr(expr, &key);

                        compiler.bytecode.emit_get_property_by_value(
                            dst.variable(),
                            key.variable(),
                            receiver.variable(),
                            object.variable(),
                        );
                        if increment {
                            compiler.bytecode.emit_inc(dst.variable(), dst.variable());
                        } else {
                            compiler.bytecode.emit_dec(dst.variable(), dst.variable());
                        }
                        compiler.bytecode.emit_set_property_by_value(
                            dst.variable(),
                            key.variable(),
                            receiver.variable(),
                            object.variable(),
                        );

                        compiler.register_allocator.dealloc(receiver);
                        compiler.register_allocator.dealloc(object);
                        compiler.register_allocator.dealloc(key);
                    }
                },
            },
            Access::This => unreachable!(),
        }
    }
}
