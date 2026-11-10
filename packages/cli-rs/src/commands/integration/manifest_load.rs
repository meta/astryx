//! TEMP: replace with the discovery lane's `loadManifest` (Boa-backed) when
//! it lands. Until then this reads a manifest whose default export is a
//! static object literal, the shape `integration add` writes.

use super::add_helpers::{AddError, R};
use crate::json::{Map, Value};
use oxc::allocator::Allocator;
use oxc::ast::ast::*;
use oxc::parser::{ParseOptions, Parser};
use oxc::span::SourceType;
use std::path::Path;

fn lit(e: &Expression) -> Option<Value> {
    match e {
        Expression::StringLiteral(s) => Some(Value::String(s.value.as_str().unwrap_or_default().to_string())),
        Expression::BooleanLiteral(b) => Some(Value::Bool(b.value)),
        Expression::NullLiteral(_) => Some(Value::Null),
        Expression::NumericLiteral(n) => Some(crate::json::num(n.value)),
        Expression::TemplateLiteral(t) if t.expressions.is_empty() => {
            Some(Value::String(t.quasis.iter().map(|q| q.value.cooked.and_then(|c| c.as_str().map(|s| s.to_string())).unwrap_or_default()).collect()))
        }
        Expression::TSAsExpression(x) => lit(&x.expression),
        Expression::TSSatisfiesExpression(x) => lit(&x.expression),
        Expression::ParenthesizedExpression(x) => lit(&x.expression),
        Expression::ArrayExpression(a) => {
            let mut v = Vec::new();
            for el in a.elements.iter() {
                v.push(lit(el.as_expression()?)?);
            }
            Some(Value::Array(v))
        }
        Expression::ObjectExpression(o) => {
            let mut m = Map::new();
            for p in o.properties.iter() {
                let ObjectPropertyKind::ObjectProperty(p) = p else { return None };
                if p.computed || p.method {
                    return None;
                }
                let k = match &p.key {
                    PropertyKey::StaticIdentifier(id) => id.name.to_string(),
                    PropertyKey::StringLiteral(s) => s.value.as_str().unwrap_or_default().to_string(),
                    _ => return None,
                };
                m.insert(k, lit(&p.value)?);
            }
            Some(Value::Object(crate::json::js_key_order(m)))
        }
        _ => None,
    }
}

/// `loadManifestObject(file, label)`: import the manifest with the real
/// module loader and return its default export, checked against the root
/// keys' schema.
pub fn load_manifest_value(file: &Path) -> R<Value> {
    let label = format!("Integration manifest {}", super::add_helpers::basename(file));
    load_manifest_labeled(file, &label)
}

fn received(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(o) if o.contains_key("__js") => match o["__js"].as_str() {
            Some("function") => "function",
            Some("undefined") => "undefined",
            _ => "object",
        },
        Value::Object(_) => "object",
    }
}

pub fn load_manifest_labeled(file: &Path, label: &str) -> R<Value> {
    let ns = crate::js::import_module(file, &crate::js::ImportOptions { jsx: false, fresh: true })
        .map_err(|e| AddError::plain(e.message.clone()))?;
    let raw = ns.get("default").cloned();
    let undefined = match &raw {
        None => true,
        Some(Value::Object(o)) => o.get("__js").and_then(|v| v.as_str()) == Some("undefined"),
        _ => false,
    };
    if undefined {
        let fix = "Fix: export the manifest object as the default export: `export default {components: './components'}`, naming the roots the package has.";
        let text = std::fs::read_to_string(file).unwrap_or_default();
        if text.trim().is_empty() {
            return Err(AddError::plain(format!("{label} is empty. {fix}")));
        }
        let names: Vec<String> = ns.keys().filter(|k| *k != "default").map(|k| format!("`{k}`")).collect();
        let found = if names.is_empty() { String::new() } else { format!(" (it exports {})", names.join(", ")) };
        return Err(AddError::plain(format!("{label} has no default export{found}. {fix}")));
    }
    let raw = raw.unwrap();
    let Value::Object(obj) = &raw else {
        return Err(AddError::plain(format!("{label} is invalid: (root): Invalid input: expected object, received {}", received(&raw))));
    };
    let mut issues = Vec::new();
    for k in ["providerId", "components", "templates", "codemods", "docs", "themes", "issuesUrl", "docsiteUrl"] {
        if let Some(v) = obj.get(k) {
            if received(v) != "string" && received(v) != "undefined" {
                issues.push(format!("{k}: Invalid input: expected string, received {}", received(v)));
            }
        }
    }
    if !issues.is_empty() {
        return Err(AddError::plain(format!("{label} is invalid: {}", issues.join("; "))));
    }
    Ok(raw)
}

/// A module's default export through the real loader, or None.
pub fn load_default(file: &Path) -> Option<Value> {
    let ns = crate::js::import_module(file, &crate::js::ImportOptions { jsx: false, fresh: true }).ok()?;
    ns.get("default").cloned()
}

/// TEMP static reader (unused by commands).
pub fn load_static_value(file: &Path) -> R<Value> {
    let source = std::fs::read_to_string(file).map_err(|e| AddError::plain(e.to_string()))?;
    let allocator = Allocator::default();
    let ret = Parser::new(&allocator, &source, SourceType::tsx())
        .with_options(ParseOptions { preserve_parens: false, ..ParseOptions::default() })
        .parse();
    let program = &ret.program;
    let mut decl: Option<&Expression> = None;
    for st in program.body.iter() {
        if let Statement::ExportDefaultDeclaration(d) = st {
            decl = d.declaration.as_expression();
        }
    }
    let Some(mut e) = decl else {
        return Err(AddError::plain("TEMP manifest loader: no default export"));
    };
    if let Expression::Identifier(id) = e {
        for st in program.body.iter() {
            let v = match st {
                Statement::VariableDeclaration(v) => Some(&**v),
                Statement::ExportDeclaration(x) => match &x.declaration {
                    Declaration::VariableDeclaration(v) => Some(&**v),
                    _ => None,
                },
                _ => None,
            };
            for d in v.iter().flat_map(|v| v.declarations.iter()) {
                if let BindingPattern::BindingIdentifier(b) = &d.id {
                    if b.name == id.name {
                        if let Some(init) = &d.init {
                            e = init;
                        }
                    }
                }
            }
        }
    }
    loop {
        match e {
            Expression::TSAsExpression(x) => e = &x.expression,
            Expression::TSSatisfiesExpression(x) => e = &x.expression,
            Expression::CallExpression(c) if !c.arguments.is_empty() => match c.arguments[0].as_expression() {
                Some(x) => e = x,
                None => break,
            },
            _ => break,
        }
    }
    lit(e).ok_or_else(|| AddError::plain("TEMP manifest loader: the default export is not static"))
}
