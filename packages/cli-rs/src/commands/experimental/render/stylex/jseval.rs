//! The static evaluator StyleX runs over `create` arguments (its port of
//! Babel's `evaluate`), with the deopt reasons it reports.

use super::Rule;
use crate::json::{Map, Value};
use oxc::ast::ast::{
    Argument, ArrayExpressionElement, ArrowFunctionExpression, AssignmentTarget, BinaryOperator, Declaration, Expression, ImportDeclarationSpecifier, LogicalOperator, ObjectPropertyKind,
    Program, PropertyKey, SimpleAssignmentTarget, Statement, UnaryOperator, UpdateExpression,
};
use oxc::ast_visit::{walk, Visit};
use oxc::span::GetSpan;
use std::cell::RefCell;

pub const NON_CONSTANT: &str = "Referenced value is not a constant.";
pub const USED_BEFORE_DECLARATION: &str = "Referenced value is used before declaration.";
pub const UNDEFINED_CONST: &str = "Referenced constant is not defined.";
pub const OBJECT_METHOD: &str = "Unsupported object method.";
pub const IMPORT_PATH_RESOLUTION_ERROR: &str = "Could not resolve the path to the imported file.";
pub const IMPORT_FILE_EVAL_ERROR: &str = "There was an error when attempting to evaluate the imported file.";

#[derive(Clone)]
pub enum JV<'a> {
    Undef,
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<JV<'a>>),
    Obj(Vec<(String, JV<'a>)>),
    Arrow(&'a ArrowFunctionExpression<'a>, Vec<(String, JV<'a>)>),
    /// A StyleX function: keyframes, firstThatWorks, when.*, ...
    Builtin(String),
    /// The `when` namespace.
    When,
    Theme(String, String),
}

impl<'a> JV<'a> {
    pub fn to_value(&self) -> Value {
        match self {
            JV::Undef | JV::Null => Value::Null,
            JV::Bool(b) => Value::Bool(*b),
            JV::Num(n) => serde_json::json!(*n),
            JV::Str(s) => Value::String(s.clone()),
            JV::Arr(a) => Value::Array(a.iter().map(|v| v.to_value()).collect()),
            JV::Obj(o) => {
                let mut m = Map::new();
                for (k, v) in o {
                    m.insert(k.clone(), v.to_value());
                }
                Value::Object(m)
            }
            _ => Value::Null,
        }
    }
    fn truthy(&self) -> bool {
        match self {
            JV::Undef | JV::Null => false,
            JV::Bool(b) => *b,
            JV::Num(n) => *n != 0.0 && !n.is_nan(),
            JV::Str(s) => !s.is_empty(),
            _ => true,
        }
    }
    fn to_str(&self) -> String {
        match self {
            JV::Undef => "undefined".into(),
            JV::Null => "null".into(),
            JV::Bool(b) => b.to_string(),
            JV::Num(n) => crate::json::js_number_to_string(*n),
            JV::Str(s) => s.clone(),
            JV::Arr(a) => a.iter().map(|v| if matches!(v, JV::Undef | JV::Null) { String::new() } else { v.to_str() }).collect::<Vec<_>>().join(","),
            JV::Obj(_) | JV::Theme(..) | JV::When => "[object Object]".into(),
            JV::Arrow(..) | JV::Builtin(_) => "function".into(),
        }
    }
    fn to_num(&self) -> f64 {
        match self {
            JV::Undef => f64::NAN,
            JV::Null => 0.0,
            JV::Bool(b) => *b as i32 as f64,
            JV::Num(n) => *n,
            JV::Str(s) => {
                let t = s.trim();
                if t.is_empty() { 0.0 } else { t.parse().unwrap_or(f64::NAN) }
            }
            JV::Arr(a) if a.is_empty() => 0.0,
            JV::Arr(a) if a.len() == 1 => a[0].to_num(),
            _ => f64::NAN,
        }
    }
    fn type_of(&self) -> &'static str {
        match self {
            JV::Undef => "undefined",
            JV::Null | JV::Arr(_) | JV::Obj(_) | JV::Theme(..) | JV::When => "object",
            JV::Bool(_) => "boolean",
            JV::Num(_) => "number",
            JV::Str(_) => "string",
            JV::Arrow(..) | JV::Builtin(_) => "function",
        }
    }
    fn strict_eq(&self, o: &JV) -> bool {
        match (self, o) {
            (JV::Undef, JV::Undef) | (JV::Null, JV::Null) => true,
            (JV::Bool(a), JV::Bool(b)) => a == b,
            (JV::Num(a), JV::Num(b)) => a == b,
            (JV::Str(a), JV::Str(b)) => a == b,
            _ => false,
        }
    }
}

fn babel_type(e: &Expression) -> &'static str {
    match e {
        Expression::BooleanLiteral(_) => "BooleanLiteral",
        Expression::NullLiteral(_) => "NullLiteral",
        Expression::NumericLiteral(_) => "NumericLiteral",
        Expression::BigIntLiteral(_) => "BigIntLiteral",
        Expression::RegExpLiteral(_) => "RegExpLiteral",
        Expression::StringLiteral(_) => "StringLiteral",
        Expression::TemplateLiteral(_) => "TemplateLiteral",
        Expression::Identifier(_) => "Identifier",
        Expression::Super(_) => "Super",
        Expression::ArrayExpression(_) => "ArrayExpression",
        Expression::ArrowFunctionExpression(_) => "ArrowFunctionExpression",
        Expression::AssignmentExpression(_) => "AssignmentExpression",
        Expression::AwaitExpression(_) => "AwaitExpression",
        Expression::BinaryExpression(_) => "BinaryExpression",
        Expression::CallExpression(_) => "CallExpression",
        Expression::ChainExpression(_) => "OptionalMemberExpression",
        Expression::ClassExpression(_) => "ClassExpression",
        Expression::ConditionalExpression(_) => "ConditionalExpression",
        Expression::FunctionExpression(_) => "FunctionExpression",
        Expression::ImportExpression(_) => "CallExpression",
        Expression::LogicalExpression(_) => "LogicalExpression",
        Expression::NewExpression(_) => "NewExpression",
        Expression::ObjectExpression(_) => "ObjectExpression",
        Expression::ParenthesizedExpression(_) => "ParenthesizedExpression",
        Expression::SequenceExpression(_) => "SequenceExpression",
        Expression::TaggedTemplateExpression(_) => "TaggedTemplateExpression",
        Expression::ThisExpression(_) => "ThisExpression",
        Expression::UnaryExpression(_) => "UnaryExpression",
        Expression::UpdateExpression(_) => "UpdateExpression",
        Expression::YieldExpression(_) => "YieldExpression",
        Expression::ImportMeta(_) => "MetaProperty",
        Expression::JSXElement(_) => "JSXElement",
        Expression::JSXFragment(_) => "JSXFragment",
        Expression::TSNonNullExpression(_) => "TSNonNullExpression",
        Expression::TSTypeAssertion(_) => "TSTypeAssertion",
        Expression::TSInstantiationExpression(_) => "TSInstantiationExpression",
        Expression::StaticMemberExpression(_) | Expression::ComputedMemberExpression(_) | Expression::PrivateFieldExpression(_) => "MemberExpression",
        _ => "Expression",
    }
}

fn unsupported(e: &Expression) -> String {
    format!("Unsupported expression: {}", babel_type(e))
}

pub enum BindingKind<'a> {
    /// A variable: its initializer (if any) and the declarator's end.
    Var(Option<&'a Expression<'a>>, u32),
    Function,
    /// A named import: source and imported name.
    Import(String, String),
    ImportOther,
}

pub struct Binding<'a> {
    pub name: String,
    pub kind: BindingKind<'a>,
    pub violated: bool,
}

/// Module-level bindings, with whether anything reassigns or mutates them.
pub fn module_bindings<'a>(program: &'a Program<'a>) -> Vec<Binding<'a>> {
    let mut out: Vec<Binding<'a>> = vec![];
    for s in &program.body {
        let decl = match s {
            Statement::VariableDeclaration(v) => Some(&**v),
            Statement::ExportDeclaration(e) => match &e.declaration {
                Declaration::VariableDeclaration(v) => Some(&**v),
                Declaration::FunctionDeclaration(f) => {
                    if let Some(id) = &f.id {
                        out.push(Binding { name: id.name.to_string(), kind: BindingKind::Function, violated: false });
                    }
                    None
                }
                _ => None,
            },
            Statement::FunctionDeclaration(f) => {
                if let Some(id) = &f.id {
                    out.push(Binding { name: id.name.to_string(), kind: BindingKind::Function, violated: false });
                }
                None
            }
            Statement::ImportDeclaration(d) => {
                for sp in d.specifiers.iter().flatten() {
                    match sp {
                        ImportDeclarationSpecifier::ImportSpecifier(n) => out.push(Binding {
                            name: n.local.name.to_string(),
                            kind: BindingKind::Import(d.source.value.as_str().unwrap_or("").to_string(), n.imported.name().to_string()),
                            violated: false,
                        }),
                        ImportDeclarationSpecifier::ImportDefaultSpecifier(n) => out.push(Binding { name: n.local.name.to_string(), kind: BindingKind::ImportOther, violated: false }),
                        ImportDeclarationSpecifier::ImportNamespaceSpecifier(n) => out.push(Binding { name: n.local.name.to_string(), kind: BindingKind::ImportOther, violated: false }),
                    }
                }
                None
            }
            _ => None,
        };
        if let Some(v) = decl {
            let is_const = v.kind == oxc::ast::ast::VariableDeclarationKind::Const;
            for d in &v.declarations {
                if let Some(id) = d.id.get_binding_identifier() {
                    let _ = is_const;
                    out.push(Binding { name: id.name.to_string(), kind: BindingKind::Var(d.init.as_ref(), d.span.end), violated: false });
                }
            }
        }
    }
    struct Violations<'b> {
        names: Vec<String>,
        hit: &'b mut Vec<String>,
    }
    fn base_ident<'x>(e: &'x Expression<'x>) -> Option<&'x str> {
        match e {
            Expression::Identifier(i) => Some(i.name.as_str()),
            _ => None,
        }
    }
    impl<'a, 'b> Visit<'a> for Violations<'b> {
        fn visit_assignment_expression(&mut self, a: &oxc::ast::ast::AssignmentExpression<'a>) {
            match &a.left {
                AssignmentTarget::AssignmentTargetIdentifier(i) => self.hit.push(i.name.to_string()),
                AssignmentTarget::StaticMemberExpression(m) => {
                    if let Some(n) = base_ident(&m.object) {
                        self.hit.push(n.to_string());
                    }
                }
                AssignmentTarget::ComputedMemberExpression(m) => {
                    if let Some(n) = base_ident(&m.object) {
                        self.hit.push(n.to_string());
                    }
                }
                _ => {}
            }
            walk::walk_assignment_expression(self, a);
        }
        fn visit_update_expression(&mut self, u: &UpdateExpression<'a>) {
            match &u.argument {
                SimpleAssignmentTarget::AssignmentTargetIdentifier(i) => self.hit.push(i.name.to_string()),
                SimpleAssignmentTarget::StaticMemberExpression(m) => {
                    if let Some(n) = base_ident(&m.object) {
                        self.hit.push(n.to_string());
                    }
                }
                SimpleAssignmentTarget::ComputedMemberExpression(m) => {
                    if let Some(n) = base_ident(&m.object) {
                        self.hit.push(n.to_string());
                    }
                }
                _ => {}
            }
            walk::walk_update_expression(self, u);
        }
        fn visit_unary_expression(&mut self, u: &oxc::ast::ast::UnaryExpression<'a>) {
            if u.operator == UnaryOperator::Delete {
                if let Expression::StaticMemberExpression(m) = &u.argument {
                    if let Some(n) = base_ident(&m.object) {
                        self.hit.push(n.to_string());
                    }
                }
            }
            walk::walk_unary_expression(self, u);
        }
        fn visit_call_expression(&mut self, c: &oxc::ast::ast::CallExpression<'a>) {
            const MUT: [&str; 9] = ["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin"];
            if let Expression::StaticMemberExpression(m) = &c.callee {
                if MUT.contains(&m.property.name.as_str()) {
                    if let Some(n) = base_ident(&m.object) {
                        self.hit.push(n.to_string());
                    }
                }
                if let Expression::Identifier(o) = &m.object {
                    if o.name == "Object" && ["assign", "defineProperty", "defineProperties", "setPrototypeOf"].contains(&m.property.name.as_str()) {
                        if let Some(Argument::Identifier(i)) = c.arguments.first() {
                            self.hit.push(i.name.to_string());
                        }
                    }
                }
            }
            walk::walk_call_expression(self, c);
        }
    }
    let mut hit = vec![];
    let mut v = Violations { names: out.iter().map(|b| b.name.clone()).collect(), hit: &mut hit };
    v.visit_program(program);
    let _ = &v.names;
    for b in out.iter_mut() {
        if hit.contains(&b.name) {
            b.violated = true;
        }
    }
    out
}

pub struct Evaluator<'a, 'c> {
    pub bindings: &'c [Binding<'a>],
    /// Names StyleX functions are bound to (named imports and the namespace).
    pub stylex_ns: &'c [String],
    pub stylex_named: &'c [(String, String)],
    /// Imported variable groups: local -> (canonical file, export).
    pub themes: &'c [(String, String, String)],
    pub rules: &'c RefCell<Vec<Rule>>,
    pub env: RefCell<Vec<(String, JV<'a>)>>,
    /// Bindings being resolved (a self reference cannot evaluate).
    pub resolving: RefCell<Vec<String>>,
    /// Variable groups an evaluation read.
    pub used_themes: RefCell<Vec<String>>,
}

type R<'a> = Result<JV<'a>, String>;

impl<'a, 'c> Evaluator<'a, 'c> {
    pub fn eval(&self, e: &'a Expression<'a>) -> R<'a> {
        match e {
            Expression::ArrowFunctionExpression(f) => {
                let all_ident = f.params.items.iter().all(|p| p.pattern.get_binding_identifier().is_some() && matches!(p.pattern, oxc::ast::ast::BindingPattern::BindingIdentifier(_)));
                if f.body.as_expression().is_some() && all_ident && f.params.rest.is_none() {
                    return Ok(JV::Arrow(f, self.env.borrow().clone()));
                }
                Err(unsupported(e))
            }
            Expression::TSAsExpression(a) => self.eval(&a.expression),
            Expression::TSSatisfiesExpression(a) => self.eval(&a.expression),
            Expression::SequenceExpression(s) => self.eval(s.expressions.last().ok_or_else(|| unsupported(e))?),
            Expression::StringLiteral(s) => Ok(JV::Str(s.value.as_str().unwrap_or("").to_string())),
            Expression::NumericLiteral(n) => Ok(JV::Num(n.value)),
            Expression::BooleanLiteral(b) => Ok(JV::Bool(b.value)),
            Expression::NullLiteral(_) => Ok(JV::Null),
            Expression::TemplateLiteral(t) => {
                let mut s = String::new();
                for (i, q) in t.quasis.iter().enumerate() {
                    s.push_str(q.value.cooked.as_ref().and_then(|c| c.as_str()).unwrap_or(""));
                    if let Some(x) = t.expressions.get(i) {
                        s.push_str(&self.eval(x)?.to_str());
                    }
                }
                Ok(JV::Str(s))
            }
            Expression::ConditionalExpression(c) => {
                if self.eval(&c.test)?.truthy() {
                    self.eval(&c.consequent)
                } else {
                    self.eval(&c.alternate)
                }
            }
            Expression::ParenthesizedExpression(p) => self.eval(&p.expression),
            Expression::StaticMemberExpression(_) | Expression::ComputedMemberExpression(_) => self.member(e),
            Expression::Identifier(id) => self.ident(id.name.as_str(), id.span.start),
            Expression::UnaryExpression(u) => {
                if u.operator == UnaryOperator::Void {
                    return Ok(JV::Undef);
                }
                if u.operator == UnaryOperator::Typeof && matches!(u.argument, Expression::FunctionExpression(_) | Expression::ArrowFunctionExpression(_) | Expression::ClassExpression(_)) {
                    return Ok(JV::Str("function".into()));
                }
                let a = self.eval(&u.argument)?;
                Ok(match u.operator {
                    UnaryOperator::LogicalNot => JV::Bool(!a.truthy()),
                    UnaryOperator::UnaryPlus => JV::Num(a.to_num()),
                    UnaryOperator::UnaryNegation => JV::Num(-a.to_num()),
                    UnaryOperator::BitwiseNot => JV::Num(!(to_i32(a.to_num())) as f64),
                    UnaryOperator::Typeof => JV::Str(a.type_of().into()),
                    _ => return Err(format!("Unsupported operator: {}", u.operator.as_str())),
                })
            }
            Expression::ArrayExpression(a) => {
                let mut out = vec![];
                for el in &a.elements {
                    match el {
                        ArrayExpressionElement::SpreadElement(_) => return Err("Unsupported expression: SpreadElement".into()),
                        ArrayExpressionElement::Elision(_) => out.push(JV::Undef),
                        other => out.push(self.eval(other.as_expression().unwrap())?),
                    }
                }
                Ok(JV::Arr(out))
            }
            Expression::ObjectExpression(o) => {
                let mut out: Vec<(String, JV)> = vec![];
                for p in &o.properties {
                    match p {
                        ObjectPropertyKind::SpreadProperty(sp) => match self.eval(&sp.argument)? {
                            JV::Obj(o) => {
                                for (k, v) in o {
                                    set(&mut out, k, v);
                                }
                            }
                            _ => {}
                        },
                        ObjectPropertyKind::ObjectProperty(p) => {
                            if p.method {
                                return Err(OBJECT_METHOD.into());
                            }
                            let key = self.key(&p.key, p.computed)?;
                            let v = self.eval(&p.value)?;
                            set(&mut out, key, v);
                        }
                    }
                }
                Ok(JV::Obj(out))
            }
            Expression::LogicalExpression(l) => {
                let left = self.eval(&l.left);
                let right = self.eval(&l.right);
                match l.operator {
                    LogicalOperator::Or => match (&left, &right) {
                        (Ok(a), _) if a.truthy() => Ok(a.clone()),
                        (Ok(_), Ok(b)) => Ok(b.clone()),
                        (Err(r), _) => Err(r.clone()),
                        (_, Err(r)) => Err(r.clone()),
                    },
                    LogicalOperator::And => match (&left, &right) {
                        (Ok(a), _) if !a.truthy() => Ok(a.clone()),
                        (Ok(_), Ok(b)) => Ok(b.clone()),
                        (Err(r), _) => Err(r.clone()),
                        (_, Err(r)) => Err(r.clone()),
                    },
                    LogicalOperator::Coalesce => match (&left, &right) {
                        (Ok(a), _) if !matches!(a, JV::Undef | JV::Null) => Ok(a.clone()),
                        (Ok(_), Ok(b)) if b.truthy() => Ok(b.clone()),
                        (Err(r), _) => Err(r.clone()),
                        (_, Err(r)) => Err(r.clone()),
                        _ => Err("unknown error".into()),
                    },
                }
            }
            Expression::BinaryExpression(b) => {
                let l = self.eval(&b.left)?;
                let r = self.eval(&b.right)?;
                binary(b.operator, &l, &r).ok_or_else(|| unsupported(e))
            }
            Expression::CallExpression(c) => self.call(c, e),
            _ => Err(unsupported(e)),
        }
    }

    pub fn key(&self, k: &'a PropertyKey<'a>, computed: bool) -> Result<String, String> {
        if computed {
            return Ok(self.eval(k.as_expression().ok_or("unknown error")?)?.to_str());
        }
        Ok(match k {
            PropertyKey::StaticIdentifier(id) => id.name.to_string(),
            PropertyKey::StringLiteral(s) => s.value.as_str().unwrap_or("").to_string(),
            PropertyKey::NumericLiteral(n) => crate::json::js_number_to_string(n.value),
            other => match other.as_expression() {
                Some(e) => self.eval(e)?.to_str(),
                None => String::new(),
            },
        })
    }

    fn ident(&self, name: &str, at: u32) -> R<'a> {
        if let Some((_, v)) = self.env.borrow().iter().rev().find(|(n, _)| n == name) {
            return Ok(v.clone());
        }
        if self.stylex_ns.iter().any(|n| n == name) {
            return Ok(JV::Builtin("ns".into()));
        }
        if let Some((_, imported)) = self.stylex_named.iter().find(|(l, _)| l == name) {
            return Ok(if imported == "when" { JV::When } else { JV::Builtin(imported.clone()) });
        }
        if let Some((_, file, export)) = self.themes.iter().find(|(l, _, _)| l == name) {
            if !self.used_themes.borrow().iter().any(|n| n == name) {
                self.used_themes.borrow_mut().push(name.to_string());
            }
            return Ok(JV::Theme(file.clone(), export.clone()));
        }
        let Some(b) = self.bindings.iter().find(|b| b.name == name) else {
            return match name {
                "undefined" => Ok(JV::Undef),
                "Infinity" => Ok(JV::Num(f64::INFINITY)),
                "NaN" => Ok(JV::Num(f64::NAN)),
                _ => Err(UNDEFINED_CONST.into()),
            };
        };
        match &b.kind {
            BindingKind::Import(..) => return Err(IMPORT_PATH_RESOLUTION_ERROR.into()),
            BindingKind::ImportOther => return Err(IMPORT_FILE_EVAL_ERROR.into()),
            _ => {}
        }
        if b.violated {
            return Err(NON_CONSTANT.into());
        }
        match &b.kind {
            BindingKind::Var(init, end) => {
                if at < *end {
                    return Err(USED_BEFORE_DECLARATION.into());
                }
                let Some(init) = init else { return Err(UNDEFINED_CONST.into()) };
                if self.resolving.borrow().iter().any(|n| n == name) {
                    return Err(UNDEFINED_CONST.into());
                }
                self.resolving.borrow_mut().push(name.to_string());
                // A binding's initializer evaluates in module scope.
                let saved = std::mem::take(&mut *self.env.borrow_mut());
                let r = self.eval(init);
                *self.env.borrow_mut() = saved;
                self.resolving.borrow_mut().pop();
                r
            }
            BindingKind::Function => Err("Unsupported expression: FunctionDeclaration".into()),
            _ => Err(UNDEFINED_CONST.into()),
        }
    }

    fn member(&self, e: &'a Expression<'a>) -> R<'a> {
        let (object, prop) = match e {
            Expression::StaticMemberExpression(m) => (&m.object, Ok(m.property.name.to_string())),
            Expression::ComputedMemberExpression(m) => (&m.object, Err(&m.expression)),
            _ => unreachable!(),
        };
        let obj = self.eval(object)?;
        let key = match prop {
            Ok(k) => k,
            Err(x) => self.eval(x)?.to_str(),
        };
        Ok(get(&obj, &key))
    }

    fn call(&self, c: &'a oxc::ast::ast::CallExpression<'a>, e: &'a Expression<'a>) -> R<'a> {
        let args = || -> Result<Vec<JV<'a>>, String> { c.arguments.iter().map(|a| match a.as_expression() { Some(x) => self.eval(x), None => Err("Unsupported expression: SpreadElement".into()) }).collect() };
        let func: Option<(JV<'a>, Option<JV<'a>>)> = match &c.callee {
            Expression::Identifier(id) => {
                let name = id.name.as_str();
                let bound = self.bindings.iter().any(|b| b.name == name) || self.env.borrow().iter().any(|(n, _)| n == name);
                if !bound && ["String", "Number", "Math", "Object", "Array"].contains(&name) {
                    Some((JV::Builtin(format!("global.{name}")), None))
                } else {
                    Some((self.ident(name, id.span.start).map_err(|r| if r == UNDEFINED_CONST { r } else { r })?, None))
                }
            }
            Expression::StaticMemberExpression(m) => {
                let prop = m.property.name.to_string();
                match &m.object {
                    Expression::Identifier(o) if ["String", "Number", "Math", "Object", "Array"].contains(&o.name.as_str()) && !["random", "assign", "defineProperties", "defineProperty", "freeze", "seal", "splice"].contains(&prop.as_str()) => Some((JV::Builtin(format!("{}.{prop}", o.name)), None)),
                    Expression::Identifier(o) if self.stylex_ns.iter().any(|n| n == o.name.as_str()) => Some((JV::Builtin(prop), None)),
                    _ => match self.eval(&m.object) {
                        Ok(JV::When) => Some((JV::Builtin(format!("when.{prop}")), None)),
                        Ok(JV::Builtin(b)) if b == "ns" => Some((JV::Builtin(prop), None)),
                        Ok(obj) => match get(&obj, &prop) {
                            JV::Undef => Some((JV::Builtin(format!("method.{prop}")), Some(obj))),
                            f => Some((f, Some(obj))),
                        },
                        Err(_) => None,
                    },
                }
            }
            _ => None,
        };
        let Some((f, this)) = func else { return Err(unsupported(e)) };
        match f {
            JV::Arrow(arrow, captured) => {
                let a = args()?;
                let mut env = captured.clone();
                for (i, p) in arrow.params.items.iter().enumerate() {
                    if let Some(id) = p.pattern.get_binding_identifier() {
                        env.push((id.name.to_string(), a.get(i).cloned().unwrap_or(JV::Undef)));
                    }
                }
                let saved = std::mem::replace(&mut *self.env.borrow_mut(), env);
                let r = self.eval(arrow.body.as_expression().unwrap());
                *self.env.borrow_mut() = saved;
                r.map_err(|_| NON_CONSTANT.to_string())
            }
            JV::Builtin(name) => {
                let a = args()?;
                self.builtin(&name, this, a).ok_or_else(|| unsupported(e))
            }
            _ => Err(unsupported(e)),
        }
    }

    fn builtin(&self, name: &str, this: Option<JV<'a>>, a: Vec<JV<'a>>) -> Option<JV<'a>> {
        let num = |i: usize| a.get(i).map(|v| v.to_num()).unwrap_or(f64::NAN);
        Some(match name {
            "keyframes" => {
                let Value::Object(frames) = a.first()?.to_value() else { return None };
                let (n, rule) = super::keyframes(&frames).ok()?;
                let mut rules = self.rules.borrow_mut();
                if !rules.iter().any(|r| r.class == rule.class) {
                    rules.push(rule);
                }
                JV::Str(n)
            }
            "firstThatWorks" => from_value(&super::first_that_works(&a.iter().map(|v| v.to_value()).collect::<Vec<_>>())),
            "defaultMarker" => JV::Str("x-default-marker".into()),
            w if w.starts_with("when.") => JV::Str(super::when(&w[5..], &a.first()?.to_str())?),
            "global.String" => JV::Str(a.first().map(|v| v.to_str()).unwrap_or_default()),
            "global.Number" => JV::Num(a.first().map(|v| v.to_num()).unwrap_or(0.0)),
            "Math.max" => JV::Num(a.iter().map(|v| v.to_num()).fold(f64::NEG_INFINITY, |m, x| if x.is_nan() || m.is_nan() { f64::NAN } else { m.max(x) })),
            "Math.min" => JV::Num(a.iter().map(|v| v.to_num()).fold(f64::INFINITY, |m, x| if x.is_nan() || m.is_nan() { f64::NAN } else { m.min(x) })),
            "Math.round" => JV::Num((num(0) + 0.5).floor()),
            "Math.floor" => JV::Num(num(0).floor()),
            "Math.ceil" => JV::Num(num(0).ceil()),
            "Math.abs" => JV::Num(num(0).abs()),
            "Math.trunc" => JV::Num(num(0).trunc()),
            "Math.sqrt" => JV::Num(num(0).sqrt()),
            "Math.pow" => JV::Num(num(0).powf(num(1))),
            "Math.sign" => JV::Num(if num(0) > 0.0 { 1.0 } else if num(0) < 0.0 { -1.0 } else { num(0) }),
            "Object.keys" => match a.first()? {
                JV::Obj(o) => JV::Arr(o.iter().map(|(k, _)| JV::Str(k.clone())).collect()),
                _ => return None,
            },
            "Object.values" => match a.first()? {
                JV::Obj(o) => JV::Arr(o.iter().map(|(_, v)| v.clone()).collect()),
                _ => return None,
            },
            "Object.entries" => match a.first()? {
                JV::Obj(o) => JV::Arr(o.iter().map(|(k, v)| JV::Arr(vec![JV::Str(k.clone()), v.clone()])).collect()),
                _ => return None,
            },
            "Object.fromEntries" => match a.first()? {
                JV::Arr(items) => {
                    let mut out = vec![];
                    for it in items {
                        if let JV::Arr(kv) = it {
                            set(&mut out, kv.first().map(|k| k.to_str()).unwrap_or_default(), kv.get(1).cloned().unwrap_or(JV::Undef));
                        }
                    }
                    JV::Obj(out)
                }
                _ => return None,
            },
            "Array.isArray" => JV::Bool(matches!(a.first(), Some(JV::Arr(_)))),
            m if m.starts_with("method.") => {
                let m = &m[7..];
                match this? {
                    JV::Str(s) => match m {
                        "toUpperCase" => JV::Str(s.to_uppercase()),
                        "toLowerCase" => JV::Str(s.to_lowercase()),
                        "trim" => JV::Str(s.trim().to_string()),
                        "concat" => JV::Str(format!("{s}{}", a.iter().map(|v| v.to_str()).collect::<String>())),
                        "repeat" => JV::Str(s.repeat(num(0).max(0.0) as usize)),
                        "startsWith" => JV::Bool(s.starts_with(&a.first()?.to_str())),
                        "endsWith" => JV::Bool(s.ends_with(&a.first()?.to_str())),
                        "includes" => JV::Bool(s.contains(&a.first()?.to_str())),
                        "toString" => JV::Str(s),
                        _ => return None,
                    },
                    JV::Num(n) => match m {
                        "toString" => JV::Str(crate::json::js_number_to_string(n)),
                        "toFixed" => JV::Str(format!("{:.*}", num(0).max(0.0) as usize, n)),
                        _ => return None,
                    },
                    JV::Arr(items) => match m {
                        "join" => JV::Str(items.iter().map(|v| if matches!(v, JV::Undef | JV::Null) { String::new() } else { v.to_str() }).collect::<Vec<_>>().join(&a.first().map(|s| s.to_str()).unwrap_or_else(|| ",".into()))),
                        "includes" => JV::Bool(items.iter().any(|v| v.strict_eq(a.first().unwrap_or(&JV::Undef)))),
                        "concat" => {
                            let mut out = items.clone();
                            for x in &a {
                                match x {
                                    JV::Arr(more) => out.extend(more.iter().cloned()),
                                    o => out.push(o.clone()),
                                }
                            }
                            JV::Arr(out)
                        }
                        _ => return None,
                    },
                    _ => return None,
                }
            }
            _ => return None,
        })
    }
}

fn to_i32(n: f64) -> i32 {
    if !n.is_finite() {
        return 0;
    }
    (n.trunc() as i64 as u64 as u32) as i32
}

fn set<'a>(out: &mut Vec<(String, JV<'a>)>, k: String, v: JV<'a>) {
    match out.iter_mut().find(|(x, _)| *x == k) {
        Some(slot) => slot.1 = v,
        None => out.push((k, v)),
    }
}

fn get<'a>(obj: &JV<'a>, key: &str) -> JV<'a> {
    match obj {
        JV::Obj(o) => o.iter().find(|(k, _)| k == key).map(|(_, v)| v.clone()).unwrap_or(JV::Undef),
        JV::Arr(a) => {
            if key == "length" {
                return JV::Num(a.len() as f64);
            }
            key.parse::<usize>().ok().and_then(|i| a.get(i).cloned()).unwrap_or(JV::Undef)
        }
        JV::Str(s) => {
            let u: Vec<u16> = s.encode_utf16().collect();
            if key == "length" {
                return JV::Num(u.len() as f64);
            }
            key.parse::<usize>().ok().and_then(|i| u.get(i).map(|c| JV::Str(String::from_utf16_lossy(&[*c])))).unwrap_or(JV::Undef)
        }
        JV::Theme(file, export) => match key {
            "__varGroupHash__" | "toString" => JV::Str(super::vars::var_group_hash(file, export)),
            "__IS_PROXY" => JV::Bool(true),
            k => JV::Str(super::vars::var_ref(file, export, k)),
        },
        JV::Builtin(b) if b == "ns" => {
            if key == "when" {
                JV::When
            } else {
                JV::Builtin(key.to_string())
            }
        }
        JV::When => match key {
            "ancestor" | "descendant" | "siblingBefore" | "siblingAfter" | "anySibling" => JV::Builtin(format!("when.{key}")),
            _ => JV::Undef,
        },
        _ => JV::Undef,
    }
}

pub fn from_value<'a>(v: &Value) -> JV<'a> {
    match v {
        Value::Null => JV::Null,
        Value::Bool(b) => JV::Bool(*b),
        Value::Number(n) => JV::Num(n.as_f64().unwrap_or(0.0)),
        Value::String(s) => JV::Str(s.clone()),
        Value::Array(a) => JV::Arr(a.iter().map(from_value).collect()),
        Value::Object(o) => JV::Obj(o.iter().map(|(k, v)| (k.clone(), from_value(v))).collect()),
    }
}

fn binary<'a>(op: BinaryOperator, l: &JV<'a>, r: &JV<'a>) -> Option<JV<'a>> {
    use BinaryOperator as B;
    let prim = |v: &JV| matches!(v, JV::Str(_) | JV::Arr(_) | JV::Obj(_) | JV::Theme(..));
    Some(match op {
        B::Addition => {
            if prim(l) || prim(r) {
                JV::Str(format!("{}{}", l.to_str(), r.to_str()))
            } else {
                JV::Num(l.to_num() + r.to_num())
            }
        }
        B::Subtraction => JV::Num(l.to_num() - r.to_num()),
        B::Multiplication => JV::Num(l.to_num() * r.to_num()),
        B::Division => JV::Num(l.to_num() / r.to_num()),
        B::Remainder => JV::Num(l.to_num() % r.to_num()),
        B::Exponential => JV::Num(l.to_num().powf(r.to_num())),
        B::LessThan | B::GreaterThan | B::LessEqualThan | B::GreaterEqualThan => {
            let ord = if let (JV::Str(a), JV::Str(b)) = (l, r) {
                Some(a.encode_utf16().cmp(b.encode_utf16()))
            } else {
                l.to_num().partial_cmp(&r.to_num())
            };
            let Some(o) = ord else { return Some(JV::Bool(false)) };
            JV::Bool(match op {
                B::LessThan => o.is_lt(),
                B::GreaterThan => o.is_gt(),
                B::LessEqualThan => o.is_le(),
                _ => o.is_ge(),
            })
        }
        B::Equality => JV::Bool(loose_eq(l, r)),
        // Babel's evaluator answers `!=` with `!==`.
        B::Inequality | B::StrictInequality => JV::Bool(!l.strict_eq(r)),
        B::StrictEquality => JV::Bool(l.strict_eq(r)),
        B::BitwiseOR => JV::Num((to_i32(l.to_num()) | to_i32(r.to_num())) as f64),
        B::BitwiseAnd => JV::Num((to_i32(l.to_num()) & to_i32(r.to_num())) as f64),
        B::BitwiseXOR => JV::Num((to_i32(l.to_num()) ^ to_i32(r.to_num())) as f64),
        B::ShiftLeft => JV::Num((to_i32(l.to_num()).wrapping_shl(to_i32(r.to_num()) as u32 & 31)) as f64),
        B::ShiftRight => JV::Num((to_i32(l.to_num()).wrapping_shr(to_i32(r.to_num()) as u32 & 31)) as f64),
        B::ShiftRightZeroFill => JV::Num(((to_i32(l.to_num()) as u32).wrapping_shr(to_i32(r.to_num()) as u32 & 31)) as f64),
        _ => return None,
    })
}

fn loose_eq(l: &JV, r: &JV) -> bool {
    match (l, r) {
        (JV::Undef | JV::Null, JV::Undef | JV::Null) => true,
        (JV::Undef | JV::Null, _) | (_, JV::Undef | JV::Null) => false,
        (JV::Str(a), JV::Str(b)) => a == b,
        (JV::Num(_) | JV::Str(_) | JV::Bool(_), JV::Num(_) | JV::Str(_) | JV::Bool(_)) => l.to_num() == r.to_num(),
        _ => false,
    }
}

pub fn first_line(reason: &str) -> String {
    reason.split('\n').next().unwrap_or("").to_string()
}

#[allow(dead_code)]
fn _span<'a>(e: &Expression<'a>) -> oxc::span::Span {
    e.span()
}
