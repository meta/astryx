use crate::optimizer::PassAction;
use boa_ast::{
    Expression, Spanned,
    expression::operator::{
        Binary,
        binary::{ArithmeticOp, BinaryOp},
    },
};

#[derive(Debug, Default)]
pub(crate) struct StrengthReduction;

impl StrengthReduction {
    pub(crate) fn reduce_expression(expr: &mut Expression) -> PassAction<Expression> {
        match expr {
            Expression::Binary(binary) => Self::try_reduce_binary(binary),
            _ => PassAction::Keep,
        }
    }

    fn is_side_effect_free(expr: &Expression) -> bool {
        matches!(expr, Expression::Literal(_) | Expression::Identifier(_))
    }

    fn as_literal_int(expr: &Expression) -> Option<i32> {
        if let Expression::Literal(lit) = expr
            && let boa_ast::expression::literal::LiteralKind::Int(v) = lit.kind()
        {
            return Some(*v);
        }
        None
    }

    fn try_reduce_binary(binary: &mut Binary) -> PassAction<Expression> {
        match binary.op() {
            BinaryOp::Arithmetic(ArithmeticOp::Exp) => Self::try_reduce_exp(binary),
            BinaryOp::Arithmetic(ArithmeticOp::Div) => Self::try_reduce_div(binary),
            _ => PassAction::Keep,
        }
    }

    fn try_reduce_div(binary: &mut Binary) -> PassAction<Expression> {
        if let Some(div_val) = Self::as_literal_int(binary.rhs())
            && div_val == 2
        {
            let span = binary.span();
            let lhs = std::mem::replace(
                binary.lhs_mut(),
                boa_ast::expression::literal::Literal::new(
                    boa_ast::expression::literal::LiteralKind::Undefined,
                    span,
                )
                .into(),
            );

            return PassAction::Replace(
                Binary::new(
                    BinaryOp::Arithmetic(ArithmeticOp::Mul),
                    lhs,
                    boa_ast::expression::literal::Literal::new(
                        boa_ast::expression::literal::LiteralKind::Num(0.5),
                        span,
                    )
                    .into(),
                )
                .into(),
            );
        }

        PassAction::Keep
    }

    fn try_reduce_exp(binary: &mut Binary) -> PassAction<Expression> {
        if let Some(exp_val) = Self::as_literal_int(binary.rhs())
            && exp_val == 2
            && Self::is_side_effect_free(binary.lhs())
        {
            let span = binary.span();
            let lhs = std::mem::replace(
                binary.lhs_mut(),
                boa_ast::expression::literal::Literal::new(
                    boa_ast::expression::literal::LiteralKind::Undefined,
                    span,
                )
                .into(),
            );
            let lhs2 = lhs.clone();

            return PassAction::Replace(
                Binary::new(BinaryOp::Arithmetic(ArithmeticOp::Mul), lhs, lhs2).into(),
            );
        }

        PassAction::Keep
    }
}
