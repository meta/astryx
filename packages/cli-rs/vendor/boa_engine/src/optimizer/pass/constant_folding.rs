use crate::value::JsVariant;
use crate::{
    Context, JsBigInt, JsValue, builtins::Number, bytecompiler::ToJsString, optimizer::PassAction,
    value::Numeric,
};
use boa_ast::expression::literal::Literal;
use boa_ast::{
    Expression, Spanned,
    expression::{
        literal::LiteralKind,
        operator::{
            Binary, Unary,
            binary::{ArithmeticOp, BinaryOp, BitwiseOp, LogicalOp, RelationalOp},
            unary::UnaryOp,
        },
    },
};
use boa_interner::JStrRef;

fn literal_to_js_value(literal: &Literal, context: &mut Context) -> JsValue {
    match literal.kind() {
        LiteralKind::String(v) => JsValue::new(v.to_js_string(context.interner())),
        LiteralKind::Num(v) => JsValue::new(*v),
        LiteralKind::Int(v) => JsValue::new(*v),
        LiteralKind::BigInt(v) => JsValue::new(JsBigInt::new(v.clone())),
        LiteralKind::Bool(v) => JsValue::new(*v),
        LiteralKind::Null => JsValue::null(),
        LiteralKind::Undefined => JsValue::undefined(),
    }
}

fn js_value_to_literal_kind(value: &JsValue, context: &mut Context) -> LiteralKind {
    match value.variant() {
        JsVariant::Null => LiteralKind::Null,
        JsVariant::Undefined => LiteralKind::Undefined,
        JsVariant::Boolean(v) => LiteralKind::Bool(v),
        JsVariant::String(v) => {
            // TODO: Replace JStrRef with JsStr this would eliminate the to_vec call.
            let v = v.to_vec();
            LiteralKind::String(context.interner_mut().get_or_intern(JStrRef::Utf16(&v)))
        }
        JsVariant::Float64(v) => LiteralKind::Num(v),
        JsVariant::Integer32(v) => LiteralKind::Int(v),
        JsVariant::BigInt(v) => LiteralKind::BigInt(Box::new(v.as_inner().clone())),
        JsVariant::Object(_) | JsVariant::Symbol(_) => {
            unreachable!("value must not be an object or symbol")
        }
    }
}

#[derive(Debug, Default)]
pub(crate) struct ConstantFolding {}

impl ConstantFolding {
    pub(crate) fn fold_expression(
        expr: &mut Expression,
        context: &mut Context,
    ) -> PassAction<Expression> {
        match expr {
            Expression::Unary(unary) => Self::constant_fold_unary_expr(unary, context),
            Expression::Binary(binary) => Self::constant_fold_binary_expr(binary, context),
            _ => PassAction::Keep,
        }
    }

    fn constant_fold_unary_expr(
        unary: &mut Unary,
        context: &mut Context,
    ) -> PassAction<Expression> {
        let Expression::Literal(literal) = unary.target() else {
            return PassAction::Keep;
        };
        let value = match (literal, unary.op()) {
            (literal, UnaryOp::Minus) => literal_to_js_value(literal, context).neg(context),
            (literal, UnaryOp::Plus) => literal_to_js_value(literal, context)
                .to_number(context)
                .map(JsValue::new),
            (literal, UnaryOp::Not) => literal_to_js_value(literal, context)
                .not()
                .map(JsValue::new),
            (literal, UnaryOp::Tilde) => Ok(
                match literal_to_js_value(literal, context)
                    .to_numeric(context)
                    .expect("should not fail")
                {
                    Numeric::Number(number) => Number::not(number).into(),
                    Numeric::BigInt(bigint) => JsBigInt::not(&bigint).into(),
                },
            ),
            (literal, UnaryOp::TypeOf) => Ok(JsValue::new(
                literal_to_js_value(literal, context).js_type_of(),
            )),
            (_, UnaryOp::Delete) => {
                return PassAction::Replace(Literal::new(true, unary.span()).into());
            }
            (_, UnaryOp::Void) => {
                return PassAction::Replace(
                    Literal::new(LiteralKind::Undefined, unary.span()).into(),
                );
            }
        };

        // If it fails then revert changes
        let Ok(value) = value else {
            return PassAction::Keep;
        };

        PassAction::Replace(Expression::Literal(Literal::new(
            js_value_to_literal_kind(&value, context),
            unary.span(),
        )))
    }

    fn constant_fold_binary_expr(
        binary: &mut Binary,
        context: &mut Context,
    ) -> PassAction<Expression> {
        let Expression::Literal(lhs) = binary.lhs() else {
            return PassAction::Keep;
        };

        // We know that the lhs is a literal (pure expression) therefore the following
        // optimization can be done:
        //
        // (pure_expression, call()) --> call()
        //
        // We cannot optimize it if rhs is `eval` or function call, because it is considered an indirect call,
        // which is not the same as direct call.
        //
        // The lhs will replace with `undefined`, to simplify it as much as possible:
        //
        // (complex_pure_expression, eval)                     --> (undefined, eval)
        // (complex_pure_expression, Object.prototype.valueOf) --> (undefined, Object.prototype.valueOf)
        if binary.op() == BinaryOp::Comma {
            let span = binary.span();
            if !matches!(binary.rhs(), Expression::Literal(_)) {
                // If left-hand side is already undefined then just keep it,
                // so we don't cause an infinite loop.
                if let Expression::Literal(literal) = binary.lhs()
                    && literal.is_undefined()
                {
                    return PassAction::Keep;
                }

                *binary.lhs_mut() = Literal::new(LiteralKind::Undefined, span).into();
                return PassAction::Modified;
            }

            // We take rhs, by replacing with a dummy value.
            let rhs = std::mem::replace(
                binary.rhs_mut(),
                Literal::new(LiteralKind::Undefined, span).into(),
            );
            return PassAction::Replace(rhs);
        }

        let lhs = literal_to_js_value(lhs, context);

        let span = binary.span();

        // Do the following optimizations if it's a logical binary expression:
        //
        // falsy              && call() --> falsy
        // truthy             || call() --> truthy
        // null/undefined     ?? call() --> call()
        //
        // The following **only** apply if the left-hand side is a pure expression (without side-effects):
        //
        // NOTE: The left-hand side is always pure because we check that it is a literal, above.
        //
        // falsy              || call() --> call()
        // truthy             && call() --> call()
        // non-null/undefined ?? call() --> non-null/undefined
        if let BinaryOp::Logical(op) = binary.op() {
            let expr = match op {
                LogicalOp::And => {
                    if lhs.to_boolean() {
                        std::mem::replace(
                            binary.rhs_mut(),
                            Literal::new(LiteralKind::Undefined, span).into(),
                        )
                    } else {
                        std::mem::replace(
                            binary.lhs_mut(),
                            Literal::new(LiteralKind::Undefined, span).into(),
                        )
                    }
                }
                LogicalOp::Or => {
                    if lhs.to_boolean() {
                        std::mem::replace(
                            binary.lhs_mut(),
                            Literal::new(LiteralKind::Undefined, span).into(),
                        )
                    } else {
                        std::mem::replace(
                            binary.rhs_mut(),
                            Literal::new(LiteralKind::Undefined, span).into(),
                        )
                    }
                }
                LogicalOp::Coalesce => {
                    if lhs.is_null_or_undefined() {
                        std::mem::replace(
                            binary.rhs_mut(),
                            Literal::new(LiteralKind::Undefined, span).into(),
                        )
                    } else {
                        std::mem::replace(
                            binary.lhs_mut(),
                            Literal::new(LiteralKind::Undefined, span).into(),
                        )
                    }
                }
            };
            return PassAction::Replace(expr);
        }

        let Expression::Literal(rhs_literal) = binary.rhs() else {
            return PassAction::Keep;
        };

        let rhs = literal_to_js_value(rhs_literal, context);

        let value = match binary.op() {
            BinaryOp::Arithmetic(op) => match op {
                ArithmeticOp::Add => lhs.add(&rhs, context),
                ArithmeticOp::Sub => lhs.sub(&rhs, context),
                ArithmeticOp::Div => lhs.div(&rhs, context),
                ArithmeticOp::Mul => lhs.mul(&rhs, context),
                ArithmeticOp::Exp => lhs.pow(&rhs, context),
                ArithmeticOp::Mod => lhs.rem(&rhs, context),
            },
            BinaryOp::Bitwise(op) => match op {
                BitwiseOp::And => lhs.bitand(&rhs, context),
                BitwiseOp::Or => lhs.bitor(&rhs, context),
                BitwiseOp::Xor => lhs.bitxor(&rhs, context),
                BitwiseOp::Shl => lhs.shl(&rhs, context),
                BitwiseOp::Shr => lhs.shr(&rhs, context),
                BitwiseOp::UShr => lhs.ushr(&rhs, context),
            },
            BinaryOp::Relational(op) => match op {
                RelationalOp::In | RelationalOp::InstanceOf => return PassAction::Keep,
                RelationalOp::Equal => lhs.equals(&rhs, context).map(JsValue::new),
                RelationalOp::NotEqual => lhs.equals(&rhs, context).map(|x| !x).map(JsValue::new),
                RelationalOp::StrictEqual => Ok(JsValue::new(lhs.strict_equals(&rhs))),
                RelationalOp::StrictNotEqual => Ok(JsValue::new(!lhs.strict_equals(&rhs))),
                RelationalOp::GreaterThan => lhs.gt(&rhs, context).map(JsValue::new),
                RelationalOp::GreaterThanOrEqual => lhs.ge(&rhs, context).map(JsValue::new),
                RelationalOp::LessThan => lhs.lt(&rhs, context).map(JsValue::new),
                RelationalOp::LessThanOrEqual => lhs.le(&rhs, context).map(JsValue::new),
            },
            BinaryOp::Logical(_) => {
                unreachable!("We already checked if it's a logical binary expression!")
            }
            BinaryOp::Comma => unreachable!("We already checked if it's a comma expression!"),
        };

        // If it fails then revert changes
        let Ok(value) = value else {
            return PassAction::Keep;
        };

        PassAction::Replace(
            Literal::new(js_value_to_literal_kind(&value, context), binary.span()).into(),
        )
    }
}
