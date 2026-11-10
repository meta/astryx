//! Object Expression.

use crate::{
    LinearPosition, LinearSpan, LinearSpanIgnoreEq, Span, Spanned, block_to_string,
    expression::{
        Expression, Identifier, RESERVED_IDENTIFIERS_STRICT,
        operator::assign::{AssignOp, AssignTarget},
    },
    function::{FormalParameterList, FunctionBody},
    join_nodes,
    operations::{ContainsSymbol, contains},
    pattern::{ObjectPattern, ObjectPatternElement},
    property::{MethodDefinitionKind, PropertyName},
    scope::FunctionScopes,
    visitor::{VisitWith, Visitor, VisitorMut},
};
use boa_interner::{Interner, Sym, ToIndentedString, ToInternedString};
use core::{fmt::Write as _, ops::ControlFlow};

/// Objects in ECMAScript may be defined as an unordered collection of related data, of
/// primitive or reference types, in the form of “key: value” pairs.
///
/// Objects can be initialized using `new Object()`, `Object.create()`, or using the literal
/// notation.
///
/// An object initializer is an expression that describes the initialization of an
/// [`Object`][object]. Objects consist of properties, which are used to describe an object.
/// Values of object properties can either contain [`primitive`][primitive] data types or other
/// objects.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#prod-ObjectLiteral
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Object_initializer
/// [object]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object
/// [primitive]: https://developer.mozilla.org/en-US/docs/Glossary/primitive
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct ObjectLiteral {
    properties: Box<[PropertyDefinition]>,
    span: Span,
}

impl ObjectLiteral {
    /// Create a new [`ObjectLiteral`].
    #[inline]
    #[must_use]
    pub fn new<T>(properties: T, span: Span) -> Self
    where
        T: Into<Box<[PropertyDefinition]>>,
    {
        Self {
            properties: properties.into(),
            span,
        }
    }

    /// Gets the object literal properties
    #[inline]
    #[must_use]
    pub const fn properties(&self) -> &[PropertyDefinition] {
        &self.properties
    }

    /// Converts the object literal into an [`ObjectPattern`].
    #[must_use]
    pub fn to_pattern(&self, strict: bool) -> Option<ObjectPattern> {
        let mut bindings = Vec::new();
        for (i, property) in self.properties.iter().enumerate() {
            match property {
                PropertyDefinition::IdentifierReference(ident) if strict && *ident == Sym::EVAL => {
                    return None;
                }
                PropertyDefinition::IdentifierReference(ident) => {
                    if strict && RESERVED_IDENTIFIERS_STRICT.contains(&ident.sym()) {
                        return None;
                    }

                    bindings.push(ObjectPatternElement::SingleName {
                        ident: *ident,
                        name: PropertyName::Literal(*ident),
                        default_init: None,
                    });
                }
                PropertyDefinition::Property(name, expr) => match (name, expr) {
                    (PropertyName::Literal(name), Expression::Identifier(ident))
                        if name.sym() == ident.sym() =>
                    {
                        if strict && *name == Sym::EVAL {
                            return None;
                        }
                        if strict && RESERVED_IDENTIFIERS_STRICT.contains(&name.sym()) {
                            return None;
                        }

                        bindings.push(ObjectPatternElement::SingleName {
                            ident: *ident,
                            name: PropertyName::Literal(*name),
                            default_init: None,
                        });
                    }
                    (PropertyName::Literal(name), Expression::Identifier(ident)) => {
                        bindings.push(ObjectPatternElement::SingleName {
                            ident: *ident,
                            name: PropertyName::Literal(*name),
                            default_init: None,
                        });
                    }
                    (PropertyName::Literal(name), Expression::ObjectLiteral(object)) => {
                        let pattern = object.to_pattern(strict)?.into();
                        bindings.push(ObjectPatternElement::Pattern {
                            name: PropertyName::Literal(*name),
                            pattern,
                            default_init: None,
                        });
                    }
                    (PropertyName::Literal(name), Expression::ArrayLiteral(array)) => {
                        let pattern = array.to_pattern(strict)?.into();
                        bindings.push(ObjectPatternElement::Pattern {
                            name: PropertyName::Literal(*name),
                            pattern,
                            default_init: None,
                        });
                    }
                    (_, Expression::Assign(assign)) => {
                        if assign.op() != AssignOp::Assign {
                            return None;
                        }
                        match assign.lhs() {
                            AssignTarget::Identifier(ident) => {
                                let name = name.literal()?;
                                if name.sym() == ident.sym() {
                                    if strict && name == Sym::EVAL {
                                        return None;
                                    }
                                    if strict && RESERVED_IDENTIFIERS_STRICT.contains(&name.sym()) {
                                        return None;
                                    }
                                }
                                let mut init = assign.rhs().clone();
                                init.set_anonymous_function_definition_name(ident);
                                bindings.push(ObjectPatternElement::SingleName {
                                    ident: *ident,
                                    name: PropertyName::Literal(name),
                                    default_init: Some(init),
                                });
                            }
                            AssignTarget::Pattern(pattern) => {
                                bindings.push(ObjectPatternElement::Pattern {
                                    name: name.clone(),
                                    pattern: pattern.clone(),
                                    default_init: Some(assign.rhs().clone()),
                                });
                            }
                            AssignTarget::Access(access) => {
                                bindings.push(ObjectPatternElement::AssignmentPropertyAccess {
                                    name: name.clone(),
                                    access: access.clone(),
                                    default_init: Some(assign.rhs().clone()),
                                });
                            }
                        }
                    }
                    (_, Expression::PropertyAccess(access)) => {
                        bindings.push(ObjectPatternElement::AssignmentPropertyAccess {
                            name: name.clone(),
                            access: access.clone(),
                            default_init: None,
                        });
                    }
                    (PropertyName::Computed(name), Expression::Identifier(ident)) => {
                        bindings.push(ObjectPatternElement::SingleName {
                            ident: *ident,
                            name: PropertyName::Computed(name.clone()),
                            default_init: None,
                        });
                    }
                    _ => return None,
                },
                PropertyDefinition::SpreadObject(spread) => {
                    match spread {
                        Expression::Identifier(ident) => {
                            bindings.push(ObjectPatternElement::RestProperty { ident: *ident });
                        }
                        Expression::PropertyAccess(access) => {
                            bindings.push(ObjectPatternElement::AssignmentRestPropertyAccess {
                                access: access.clone(),
                            });
                        }
                        _ => return None,
                    }
                    if i + 1 != self.properties.len() {
                        return None;
                    }
                }
                PropertyDefinition::MethodDefinition(_) => return None,
                PropertyDefinition::CoverInitializedName(ident, expr) => {
                    if strict && [Sym::EVAL, Sym::ARGUMENTS].contains(&ident.sym()) {
                        return None;
                    }
                    let mut expr = expr.clone();
                    expr.set_anonymous_function_definition_name(ident);
                    bindings.push(ObjectPatternElement::SingleName {
                        ident: *ident,
                        name: PropertyName::Literal(*ident),
                        default_init: Some(expr),
                    });
                }
            }
        }

        Some(ObjectPattern::new(bindings.into(), self.span))
    }
}

impl Spanned for ObjectLiteral {
    #[inline]
    fn span(&self) -> Span {
        self.span
    }
}

impl ToIndentedString for ObjectLiteral {
    fn to_indented_string(&self, interner: &Interner, indent_n: usize) -> String {
        let mut buf = "{\n".to_owned();
        let indentation = "    ".repeat(indent_n + 1);
        for property in &*self.properties {
            match property {
                PropertyDefinition::IdentifierReference(ident) => {
                    let _ = writeln!(
                        buf,
                        "{indentation}{},",
                        interner.resolve_expect(ident.sym())
                    );
                }
                PropertyDefinition::Property(key, value) => {
                    let _ = writeln!(
                        buf,
                        "{indentation}{}: {},",
                        key.to_interned_string(interner),
                        value.to_no_indent_string(interner, indent_n + 1)
                    );
                }
                PropertyDefinition::SpreadObject(key) => {
                    let _ = writeln!(buf, "{indentation}...{},", key.to_interned_string(interner));
                }
                PropertyDefinition::MethodDefinition(m) => {
                    buf.push_str(&m.to_indented_string(interner, indent_n));
                }
                PropertyDefinition::CoverInitializedName(ident, expr) => {
                    let _ = writeln!(
                        buf,
                        "{indentation}{} = {},",
                        interner.resolve_expect(ident.sym()),
                        expr.to_no_indent_string(interner, indent_n + 1)
                    );
                }
            }
        }
        let _ = write!(buf, "{}}}", "    ".repeat(indent_n));

        buf
    }
}

impl From<ObjectLiteral> for Expression {
    #[inline]
    fn from(obj: ObjectLiteral) -> Self {
        Self::ObjectLiteral(obj)
    }
}

impl VisitWith for ObjectLiteral {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        for pd in &*self.properties {
            visitor.visit_property_definition(pd)?;
        }
        ControlFlow::Continue(())
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        for pd in &mut *self.properties {
            visitor.visit_property_definition_mut(pd)?;
        }
        ControlFlow::Continue(())
    }
}

/// Describes the definition of a property within an object literal.
///
/// A property has a name (a string) and a value (primitive, method, or object reference).
/// Note that when we say that "a property holds an object", that is shorthand for "a property holds an object reference".
/// This distinction matters because the original referenced object remains unchanged when you change the property's value.
///
/// More information:
///  - [ECMAScript reference][spec]
///  - [MDN documentation][mdn]
///
/// [spec]: https://tc39.es/ecma262/#prod-PropertyDefinition
/// [mdn]: https://developer.mozilla.org/en-US/docs/Glossary/property/JavaScript
// TODO: Support all features: https://tc39.es/ecma262/#prod-PropertyDefinition
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub enum PropertyDefinition {
    /// Puts a variable into an object.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-IdentifierReference
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Object_initializer#Property_definitions
    IdentifierReference(Identifier),

    /// Binds a property name to a JavaScript value.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-PropertyDefinition
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Object_initializer#Property_definitions
    Property(PropertyName, Expression),

    /// A property of an object can also refer to a function or a getter or setter method.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-MethodDefinition
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Object_initializer#Method_definitions
    MethodDefinition(ObjectMethodDefinition),

    /// The Rest/Spread Properties for ECMAScript proposal (stage 4) adds spread properties to object literals.
    /// It copies own enumerable properties from a provided object onto a new object.
    ///
    /// Shallow-cloning (excluding `prototype`) or merging objects is now possible using a shorter syntax than `Object.assign()`.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-PropertyDefinition
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Object_initializer#Spread_properties
    SpreadObject(Expression),

    /// Cover grammar for when an object literal is used as an object binding pattern.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#prod-CoverInitializedName
    CoverInitializedName(Identifier, Expression),
}

impl VisitWith for PropertyDefinition {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        match self {
            Self::IdentifierReference(id) => visitor.visit_identifier(id),
            Self::Property(pn, expr) => {
                visitor.visit_property_name(pn)?;
                visitor.visit_expression(expr)
            }
            Self::MethodDefinition(m) => visitor.visit_object_method_definition(m),
            Self::SpreadObject(expr) => visitor.visit_expression(expr),
            Self::CoverInitializedName(id, expr) => {
                visitor.visit_identifier(id)?;
                visitor.visit_expression(expr)
            }
        }
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        match self {
            Self::IdentifierReference(id) => visitor.visit_identifier_mut(id),
            Self::Property(pn, expr) => {
                visitor.visit_property_name_mut(pn)?;
                visitor.visit_expression_mut(expr)
            }
            Self::MethodDefinition(m) => visitor.visit_object_method_definition_mut(m),
            Self::SpreadObject(expr) => visitor.visit_expression_mut(expr),
            Self::CoverInitializedName(id, expr) => {
                visitor.visit_identifier_mut(id)?;
                visitor.visit_expression_mut(expr)
            }
        }
    }
}

/// A method definition.
///
/// This type is specific to object method definitions.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#prod-MethodDefinition
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Clone, Debug, PartialEq)]
pub struct ObjectMethodDefinition {
    pub(crate) name: PropertyName,
    pub(crate) parameters: FormalParameterList,
    pub(crate) body: FunctionBody,
    pub(crate) contains_direct_eval: bool,
    kind: MethodDefinitionKind,

    #[cfg_attr(feature = "serde", serde(skip))]
    pub(crate) scopes: FunctionScopes,
    linear_span: LinearSpanIgnoreEq,
}

impl ObjectMethodDefinition {
    /// Creates a new object method definition.
    #[inline]
    #[must_use]
    pub fn new(
        name: PropertyName,
        parameters: FormalParameterList,
        body: FunctionBody,
        kind: MethodDefinitionKind,
        start_linear_pos: LinearPosition,
    ) -> Self {
        let contains_direct_eval = contains(&parameters, ContainsSymbol::DirectEval)
            || contains(&body, ContainsSymbol::DirectEval);
        let linear_span = LinearSpan::new(start_linear_pos, body.linear_pos_end()).into();

        Self {
            name,
            parameters,
            body,
            contains_direct_eval,
            kind,
            scopes: FunctionScopes::default(),
            linear_span,
        }
    }

    /// Returns the name of the object method definition.
    #[inline]
    #[must_use]
    pub const fn name(&self) -> &PropertyName {
        &self.name
    }

    /// Returns the parameters of the object method definition.
    #[inline]
    #[must_use]
    pub const fn parameters(&self) -> &FormalParameterList {
        &self.parameters
    }

    /// Returns the body of the object method definition.
    #[inline]
    #[must_use]
    pub const fn body(&self) -> &FunctionBody {
        &self.body
    }

    /// Returns the kind of the object method definition.
    #[inline]
    #[must_use]
    pub const fn kind(&self) -> MethodDefinitionKind {
        self.kind
    }

    /// Gets the scopes of the object method definition.
    #[inline]
    #[must_use]
    pub const fn scopes(&self) -> &FunctionScopes {
        &self.scopes
    }

    /// Gets linear span of the function declaration.
    #[inline]
    #[must_use]
    pub const fn linear_span(&self) -> LinearSpan {
        self.linear_span.0
    }

    /// Returns `true` if the object method definition contains a direct call to `eval`.
    #[inline]
    #[must_use]
    pub const fn contains_direct_eval(&self) -> bool {
        self.contains_direct_eval
    }
}

impl ToIndentedString for ObjectMethodDefinition {
    fn to_indented_string(&self, interner: &Interner, indent_n: usize) -> String {
        let indentation = "    ".repeat(indent_n + 1);
        let prefix = match &self.kind {
            MethodDefinitionKind::Get => "get ",
            MethodDefinitionKind::Set => "set ",
            MethodDefinitionKind::Ordinary => "",
            MethodDefinitionKind::Generator => "*",
            MethodDefinitionKind::AsyncGenerator => "async *",
            MethodDefinitionKind::Async => "async ",
        };
        let name = self.name.to_interned_string(interner);
        let parameters = join_nodes(interner, self.parameters.as_ref());
        let body = block_to_string(&self.body.statements, interner, indent_n + 1);
        format!("{indentation}{prefix}{name}({parameters}) {body},\n")
    }
}

impl VisitWith for ObjectMethodDefinition {
    fn visit_with<'a, V>(&'a self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: Visitor<'a>,
    {
        visitor.visit_property_name(&self.name)?;
        visitor.visit_formal_parameter_list(&self.parameters)?;
        visitor.visit_function_body(&self.body)
    }

    fn visit_with_mut<'a, V>(&'a mut self, visitor: &mut V) -> ControlFlow<V::BreakTy>
    where
        V: VisitorMut<'a>,
    {
        visitor.visit_property_name_mut(&mut self.name)?;
        visitor.visit_formal_parameter_list_mut(&mut self.parameters)?;
        visitor.visit_function_body_mut(&mut self.body)
    }
}
