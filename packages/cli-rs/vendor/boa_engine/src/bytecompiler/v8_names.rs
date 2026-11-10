//! How V8 prints an expression in an error message ("o.a.b is not a
//! function", "o.items is not iterable"), patched in for the Astryx CLI
//! clone. A template holds `\u{0}` where the runtime value's description
//! goes.

use super::ByteCompiler;
use boa_ast::{
    Expression,
    expression::{
        access::{PropertyAccess, PropertyAccessField},
        literal::LiteralKind,
        operator::binary::BinaryOp,
        OptionalOperationKind,
    },
};

/// The placeholder for the runtime value's word (`undefined`, `null`, …).
pub(crate) const VALUE: char = '\u{0}';
/// The placeholder for the runtime value's typed description (`object
/// null`, `number 5`, …).
pub(crate) const VALUE_DESC: char = '\u{1}';

impl ByteCompiler<'_> {
    /// Record a V8 message template for the instruction just emitted.
    pub(crate) fn note_v8(&mut self, kind: char, template: String) {
        let end = self.next_opcode_location().as_u32();
        self.v8_names.push((end, format!("{kind}{template}")));
    }

    fn v8_key(&self, field: &PropertyAccessField) -> String {
        match field {
            PropertyAccessField::Const(id) => format!(".{}", self.interner.resolve_expect(id.sym())),
            PropertyAccessField::Expr(e) => match e.as_ref() {
                Expression::Literal(l) => match l.kind() {
                    LiteralKind::String(s) => format!(".{}", self.interner.resolve_expect(*s)),
                    LiteralKind::Int(i) => format!("[{i}]"),
                    LiteralKind::Num(n) => format!("[{}]", crate::builtins::number::Number::to_js_string_radix(*n, 10).to_std_string_escaped()),
                    _ => format!("[{}]", self.v8_render(e)),
                },
                other => format!("[{}]", self.v8_render(other)),
            },
        }
    }

    fn v8_number(e: &Expression) -> Option<f64> {
        match e {
            Expression::Literal(l) => match l.kind() {
                LiteralKind::Int(i) => Some(f64::from(*i)),
                LiteralKind::Num(n) => Some(*n),
                _ => None,
            },
            _ => None,
        }
    }

    /// The expression as V8 prints it.
    pub(crate) fn v8_render(&self, expr: &Expression) -> String {
        match expr {
            Expression::Identifier(id) => self.interner.resolve_expect(id.sym()).to_string(),
            Expression::This(_) => "this".into(),
            Expression::Literal(l) => match l.kind() {
                LiteralKind::Null => "null".into(),
                LiteralKind::Undefined => "undefined".into(),
                LiteralKind::Bool(b) => b.to_string(),
                LiteralKind::Int(i) => i.to_string(),
                LiteralKind::Num(n) => crate::builtins::number::Number::to_js_string_radix(*n, 10).to_std_string_escaped(),
                LiteralKind::String(s) => format!("\"{}\"", self.interner.resolve_expect(*s)),
                LiteralKind::BigInt(b) => format!("{b}n"),
            },
            Expression::ObjectLiteral(o) if o.properties().is_empty() => "{}".into(),
            Expression::ArrayLiteral(a) if a.as_ref().is_empty() => "[]".into(),
            Expression::Parenthesized(p) => self.v8_render(p.expression()),
            Expression::PropertyAccess(PropertyAccess::Simple(a)) => {
                format!("{}{}", self.v8_render(a.target()), self.v8_key(a.field()))
            }
            Expression::PropertyAccess(PropertyAccess::Private(a)) => {
                format!("{}.#{}", self.v8_render(a.target()), self.interner.resolve_expect(a.field().description()))
            }
            Expression::PropertyAccess(PropertyAccess::Super(a)) => format!("(intermediate value){}", self.v8_key(a.field())),
            Expression::Call(c) => format!("{}(...)", self.v8_render(c.function())),
            Expression::Optional(o) => self.v8_render_optional(o, o.chain().len()),
            Expression::Binary(b) if b.op() == BinaryOp::Comma => {
                format!("({} , {})", self.v8_render(b.lhs()), self.v8_render(b.rhs()))
            }
            // V8 folds arithmetic on number literals before printing.
            Expression::Binary(b) => match (Self::v8_number(b.lhs()), Self::v8_number(b.rhs()), b.op()) {
                (Some(l), Some(r), BinaryOp::Arithmetic(op)) => {
                    use boa_ast::expression::operator::binary::ArithmeticOp as A;
                    let v = match op {
                        A::Add => l + r,
                        A::Sub => l - r,
                        A::Mul => l * r,
                        A::Div => l / r,
                        A::Mod => l % r,
                        A::Exp => l.powf(r),
                    };
                    crate::builtins::number::Number::to_js_string_radix(v, 10).to_std_string_escaped()
                }
                _ => "(intermediate value)".into(),
            },
            _ => "(intermediate value)".into(),
        }
    }

    /// An optional chain's target and its first `n` operations, as V8
    /// prints them.
    pub(crate) fn v8_render_optional(&self, o: &boa_ast::expression::Optional, n: usize) -> String {
        {
            {
                let mut out = self.v8_render(o.target());
                for op in o.chain().iter().take(n) {
                    let q = if op.shorted() { "?." } else { "" };
                    match op.kind() {
                        OptionalOperationKind::SimplePropertyAccess { field } => {
                            let key = self.v8_key(field);
                            if q.is_empty() {
                                out.push_str(&key);
                            } else {
                                out.push_str("?.");
                                out.push_str(key.strip_prefix('.').unwrap_or(&key));
                            }
                        }
                        OptionalOperationKind::PrivatePropertyAccess { field } => {
                            out.push_str(if q.is_empty() { "." } else { "?." });
                            out.push('#');
                            out.push_str(&self.interner.resolve_expect(field.description()).to_string());
                        }
                        OptionalOperationKind::Call { .. } => out.push_str("(...)"),
                    }
                }
                out
            }
        }
    }

    /// The template for a call or `new` whose target is not callable.
    pub(crate) fn v8_not_callable(&self, callee: &Expression, new: bool) -> String {
        let name = match callee {
            Expression::Parenthesized(p) if !matches!(p.expression(), Expression::Binary(_)) => self.v8_render(p.expression()),
            other => self.v8_render(other),
        };
        if new { format!("{name} is not a constructor") } else { format!("{name} is not a function") }
    }

    /// The template for a `for…of` / spread / array pattern whose value is
    /// not iterable.
    pub(crate) fn v8_not_iterable(&self, iterable: &Expression, site: IterSite) -> String {
        let inner = match iterable {
            Expression::Parenthesized(p) => p.expression(),
            e => e,
        };
        match site {
            IterSite::ForOf => match inner {
                Expression::Call(c) => format!("{} is not a function or its return value is not iterable", self.v8_render(c.function())),
                e => format!("{} is not iterable", self.v8_render(e)),
            },
            IterSite::ArraySpread => format!("{} is not iterable", self.v8_render(inner)),
            IterSite::CallSpread => format!("{} is not iterable (cannot read property {VALUE})", self.v8_render(inner)),
            IterSite::Pattern => match inner {
                Expression::PropertyAccess(_) | Expression::Call(_) | Expression::Optional(_) => {
                    format!("{VALUE} is not iterable (cannot read property Symbol(Symbol.iterator))")
                }
                e => format!("{} is not iterable", self.v8_render(e)),
            },
        }
    }
}

/// Where a value is iterated.
#[derive(Clone, Copy)]
pub(crate) enum IterSite {
    ForOf,
    ArraySpread,
    CallSpread,
    Pattern,
}
