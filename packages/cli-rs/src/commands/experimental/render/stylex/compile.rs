//! Find StyleX calls in a module (`create`, `keyframes`, `defineVars`),
//! evaluate their static arguments, and replace each with what the compiled
//! module holds.

use super::jseval::{first_line, module_bindings, Evaluator, JV};
use super::{Rule, StylexError};
use crate::json::{Map, Value};
use oxc::allocator::Allocator;
use oxc::ast::ast::{Argument, Declaration, Expression, ImportDeclarationSpecifier, ObjectExpression, ObjectPropertyKind, Statement, VariableDeclarationKind};
use oxc::ast_visit::{walk, Visit};
use oxc::parser::Parser;
use oxc::span::{GetSpan, SourceType};
use std::cell::RefCell;

/// A dynamic style value: `--x-<name>` set inline from an expression.
pub struct Inline {
    var_name: String,
    path: String,
    expr: String,
    unit: &'static str,
}

/// One dynamic namespace: its parameter text and inline values.
pub struct DynFn {
    params: String,
    inline: Vec<Inline>,
}

fn partial_obj<'a>(o: &'a ObjectExpression<'a>, ev: &Evaluator<'a, '_>, src: &str, key_path: &[String], inline: &mut Vec<Inline>) -> Result<Value, String> {
    let mut m = Map::new();
    for p in &o.properties {
        let p = match p {
            ObjectPropertyKind::ObjectProperty(p) if !p.method => p,
            ObjectPropertyKind::ObjectProperty(_) => return Err(super::jseval::OBJECT_METHOD.into()),
            ObjectPropertyKind::SpreadProperty(sp) => {
                if let Value::Object(more) = ev.eval(&sp.argument)?.to_value() {
                    for (k, v) in more {
                        m.insert(k, v);
                    }
                }
                continue;
            }
        };
        let mut key = ev.key(&p.key, p.computed)?;
        if key.starts_with("var(") && key.ends_with(')') && key_path.is_empty() {
            key = key[4..key.len() - 1].to_string();
        }
        if let Expression::ObjectExpression(inner) = &p.value {
            let mut kp = key_path.to_vec();
            kp.push(key.clone());
            let v = partial_obj(inner, ev, src, &kp, inline)?;
            m.insert(key, v);
            continue;
        }
        match ev.eval(&p.value) {
            Ok(v) => {
                m.insert(key, v.to_value());
            }
            Err(_) => {
                let mut full = key_path.to_vec();
                full.push(key.clone());
                let var_name = format!("--x-{}", if key_path.is_empty() { key.clone() } else { super::hash(&full.join("_")) });
                m.insert(key.clone(), Value::String(format!("var({var_name})")));
                let prop = full.iter().find(|k| !k.starts_with(':') && !k.starts_with('@') && *k != "default").cloned().unwrap_or(key.clone());
                let timed = ["animationDelay", "animationDuration", "transitionDelay", "transitionDuration"].contains(&prop.as_str());
                let unit = if timed || super::priorities_data::LENGTH_UNITS.contains(&prop.as_str()) { super::number_suffix_pub(&prop) } else { "" };
                let sp = p.value.span();
                inline.push(Inline { var_name, path: full.join("_"), expr: src[sp.start as usize..sp.end as usize].to_string(), unit });
            }
        }
    }
    Ok(Value::Object(m))
}

type CreateArg = (Map<String, Value>, Vec<(String, DynFn)>);

/// `evaluateStyleXCreateArg`: the namespaces, and the dynamic ones.
fn eval_create_arg<'a>(o: &'a ObjectExpression<'a>, ev: &Evaluator<'a, '_>, src: &str) -> Result<CreateArg, String> {
    let mut m = Map::new();
    let mut fns = vec![];
    for p in &o.properties {
        let ObjectPropertyKind::ObjectProperty(p) = p else {
            return Err("Object spreads are not allowed in create() calls.".into());
        };
        let key = ev.key(&p.key, p.computed)?;
        let dyn_body = match &p.value {
            Expression::ArrowFunctionExpression(f) => f.body.as_expression().map(|b| (f, b)),
            _ => None,
        };
        let Some((f, body)) = dyn_body else {
            m.insert(key, ev.eval(&p.value)?.to_value());
            continue;
        };
        let mut body = body;
        while let Expression::ParenthesizedExpression(pe) = body {
            body = &pe.expression;
        }
        let Expression::ObjectExpression(obj) = body else {
            m.insert(key, ev.eval(&p.value)?.to_value());
            continue;
        };
        // Parameters evaluate as unknown values inside the body.
        let mut inline = vec![];
        let saved = std::mem::take(&mut *ev.env.borrow_mut());
        let v = partial_obj(obj, ev, src, &[], &mut inline);
        *ev.env.borrow_mut() = saved;
        m.insert(key.clone(), v?);
        let ps = f.params.span;
        let mut params = src[ps.start as usize..ps.end as usize].to_string();
        if !params.starts_with('(') {
            params = format!("({params})");
        }
        fns.push((key, DynFn { params, inline }));
    }
    Ok((m, fns))
}

pub struct Compiled {
    pub source: String,
    pub rules: Vec<Rule>,
}

fn q(s: &str) -> String {
    let mut o = String::new();
    crate::json::quote(&mut o, s);
    o
}

/// Compile every StyleX call of `source` (a module of the page). `None`
/// when the module has none.
pub fn compile_module(source: &str, file: &str, root: &str) -> Result<Option<Compiled>, StylexError> {
    if !source.contains("stylex") {
        return Ok(None);
    }
    let alloc = Allocator::default();
    let st = SourceType::from_path(file).unwrap_or_else(|_| SourceType::tsx()).with_jsx(true);
    let ret = Parser::new(&alloc, source, st).parse();
    if !ret.diagnostics.is_empty() {
        return Ok(None);
    }
    let program = &ret.program;
    let bindings = module_bindings(program);
    let canonical = super::vars::canonical_file_path(file, root);
    let mut ns: Vec<String> = vec![];
    let mut named: Vec<(String, String)> = vec![];
    let mut themes: Vec<(String, String, String)> = vec![];
    let mut create_names: Vec<String> = vec![];
    let mut replacements: Vec<(u32, u32, String)> = vec![];
    let mut theme_imports: Vec<(String, u32, String)> = vec![];
    for s in &program.body {
        let Statement::ImportDeclaration(d) = s else { continue };
        let src = d.source.value.as_str().unwrap_or("");
        if src == "@stylexjs/stylex" || src == "stylex" {
            for sp in d.specifiers.iter().flatten() {
                match sp {
                    ImportDeclarationSpecifier::ImportNamespaceSpecifier(n) => ns.push(n.local.name.to_string()),
                    ImportDeclarationSpecifier::ImportDefaultSpecifier(n) => ns.push(n.local.name.to_string()),
                    ImportDeclarationSpecifier::ImportSpecifier(n) => {
                        let imported = n.imported.name().to_string();
                        if imported == "create" {
                            create_names.push(n.local.name.to_string());
                        }
                        named.push((n.local.name.to_string(), imported));
                    }
                }
            }
        } else if let Some(theme_file) = theme_file(src, file) {
            let canon = super::vars::canonical_file_path(&theme_file, root);
            for sp in d.specifiers.iter().flatten() {
                if let ImportDeclarationSpecifier::ImportSpecifier(n) = sp {
                    themes.push((n.local.name.to_string(), canon.clone(), n.imported.name().to_string()));
                    theme_imports.push((n.local.name.to_string(), d.span.start, src.to_string()));
                }
            }
        }
    }
    if ns.is_empty() && named.is_empty() {
        return Ok(None);
    }
    let rules_cell: RefCell<Vec<Rule>> = RefCell::new(vec![]);
    let ev = Evaluator { bindings: &bindings, stylex_ns: &ns, stylex_named: &named, themes: &themes, rules: &rules_cell, env: RefCell::new(vec![]), resolving: RefCell::new(vec![]), used_themes: RefCell::new(vec![]) };
    let callee_is = |c: &Expression, name: &str| -> bool {
        match c {
            Expression::Identifier(id) => named.iter().any(|(l, i)| l == id.name.as_str() && i == name),
            Expression::StaticMemberExpression(m) => m.property.name == name && matches!(&m.object, Expression::Identifier(o) if ns.iter().any(|n| n == o.name.as_str())),
            _ => false,
        }
    };
    let compile_err = |r: String| StylexError(format!("compile:{}", first_line(&r)));
    // Top-level `keyframes` and `defineVars` declarations.
    for s in &program.body {
        let v = match s {
            Statement::VariableDeclaration(v) => &**v,
            Statement::ExportDeclaration(e) => match &e.declaration {
                Declaration::VariableDeclaration(v) => &**v,
                _ => continue,
            },
            _ => continue,
        };
        if v.kind != VariableDeclarationKind::Const {
            continue;
        }
        for d in &v.declarations {
            let (Some(id), Some(Expression::CallExpression(c))) = (d.id.get_binding_identifier(), &d.init) else { continue };
            if callee_is(&c.callee, "defineVars") {
                let arg = c.arguments.first().and_then(|a| a.as_expression()).ok_or_else(|| compile_err("defineVars() should have 1 argument.".into()))?;
                let vars = ev.eval(arg).map_err(compile_err)?;
                let Value::Object(vars) = vars.to_value() else { return Err(compile_err("defineVars() can only accept an object.".into())) };
                let (text, rules) = super::vars::define_vars(&vars, &canonical, id.name.as_str()).map_err(|e| compile_err(e.0))?;
                rules_cell.borrow_mut().extend(rules);
                replacements.push((c.span.start, c.span.end, text));
            } else if callee_is(&c.callee, "keyframes") {
                let init = d.init.as_ref().unwrap();
                match ev.eval(init).map_err(compile_err)? {
                    JV::Str(name) => replacements.push((c.span.start, c.span.end, q(&name))),
                    _ => return Err(compile_err("keyframes() can only accept an object.".into())),
                }
            }
        }
    }
    struct Finder<'s> {
        is_create: &'s dyn Fn(&Expression) -> bool,
        calls: Vec<(u32, u32, *const ObjectExpression<'static>)>,
        bad: Option<u32>,
    }
    impl<'a, 's> Visit<'a> for Finder<'s> {
        fn visit_call_expression(&mut self, c: &oxc::ast::ast::CallExpression<'a>) {
            if (self.is_create)(&c.callee) {
                match c.arguments.first() {
                    Some(Argument::ObjectExpression(o)) if c.arguments.len() == 1 => {
                        self.calls.push((c.span.start, c.span.end, (&**o) as *const ObjectExpression<'a> as *const ObjectExpression<'static>));
                    }
                    _ => self.bad = Some(c.span.start),
                }
                return;
            }
            walk::walk_call_expression(self, c);
        }
    }
    let is_create = |c: &Expression| callee_is(c, "create") || matches!(c, Expression::Identifier(id) if create_names.iter().any(|n| n == id.name.as_str()));
    let mut f = Finder { is_create: &is_create, calls: vec![], bad: None };
    f.visit_program(program);
    if f.bad.is_some() {
        return Err(compile_err("create() can only accept an object.".into()));
    }
    if f.calls.is_empty() && replacements.is_empty() {
        return Ok(None);
    }
    let mut rules: Vec<Rule> = vec![];
    for (start, end, ptr) in &f.calls {
        // SAFETY: the node lives in `alloc`, which outlives this loop.
        let obj: &ObjectExpression = unsafe { &*(*ptr as *const ObjectExpression) };
        let (namespaces_obj, fns) = eval_create_arg(obj, &ev, source).map_err(compile_err)?;
        let (namespaces, injected, paths) = super::create_set_with_paths(&namespaces_obj).map_err(|e| compile_err(e.0))?;
        for r in injected {
            if !rules.iter().any(|x| x.class == r.class) {
                rules.push(r);
            }
        }
        // Dynamic values declare their variables last.
        for (_, f) in &fns {
            for i in &f.inline {
                let pseudo_el = i.path.split('_').any(|p| p.starts_with("::"));
                let r = Rule { class: i.var_name.clone(), ltr: format!("@property {} {{ syntax: \"*\"; inherits: {};}}", i.var_name, if pseudo_el { "true" } else { "false" }), rtl: None, priority: 0.0 };
                if !rules.iter().any(|x| x.class == r.class) {
                    rules.push(r);
                }
            }
        }
        replacements.push((*start, *end, compiled_with_fns(&namespaces, &paths, &fns)));
    }
    let mut all_rules = rules_cell.borrow().clone();
    for r in rules {
        if !all_rules.iter().any(|x| x.class == r.class) {
            all_rules.push(r);
        }
    }
    // An evaluated variable group keeps its module loaded once its names
    // are inlined (one bare import per source, before its declaration).
    let mut added: Vec<String> = vec![];
    for local in ev.used_themes.borrow().iter() {
        if let Some((_, at, src)) = theme_imports.iter().find(|(l, _, _)| l == local) {
            if !added.contains(src) {
                added.push(src.clone());
                replacements.push((*at, *at, format!("import {};", q(src))));
            }
        }
    }
    let mut out = source.to_string();
    replacements.sort_by(|a, b| b.0.cmp(&a.0));
    for (start, end, text) in replacements {
        out.replace_range(start as usize..end as usize, &text);
    }
    Ok(Some(Compiled { source: out, rules: all_rules }))
}

/// The compiled namespaces, with each dynamic one as a function that
/// returns its static classes, its value-dependent classes, and the
/// inline variables.
fn compiled_with_fns(namespaces: &super::Namespaces, paths: &[Vec<(String, String)>], fns: &[(String, DynFn)]) -> String {
    let parts: Vec<String> = namespaces
        .iter()
        .zip(paths)
        .map(|((name, keys), paths)| {
            let Some((_, f)) = fns.iter().find(|(n, _)| n == name) else {
                let mut inner: Vec<String> = keys.iter().map(|(k, v)| format!("{}: {}", q(k), v.as_ref().map(|c| q(c)).unwrap_or_else(|| "null".into()))).collect();
                inner.push("$$css: true".into());
                return format!("{}: {{{}}}", q(name), inner.join(", "));
            };
            let mut statics = vec![];
            let mut dynamics = vec![];
            for (k, v) in keys {
                let classes: Vec<&str> = v.as_deref().map(|c| c.split(' ').collect()).unwrap_or_default();
                let mut is_static = true;
                let mut exprs = vec![];
                for (i, cls) in classes.iter().enumerate() {
                    let with_space = if i == classes.len() - 1 { cls.to_string() } else { format!("{cls} ") };
                    let path = paths.iter().find(|(c, _)| c == cls).map(|(_, p)| p.as_str());
                    match f.inline.iter().find(|d| Some(d.path.as_str()) == path) {
                        Some(d) => {
                            is_static = false;
                            exprs.push(format!("(({e}) != null ? {c} : ({e}))", e = d.expr, c = q(&with_space)));
                        }
                        None => exprs.push(q(&with_space)),
                    }
                }
                let joined = if exprs.is_empty() { "\"\"".to_string() } else { exprs.join(" + ") };
                if is_static {
                    statics.push(format!("{}: {joined}", q(k)));
                } else {
                    dynamics.push(format!("{}: {joined}", q(k)));
                }
            }
            let inline: Vec<String> = f
                .inline
                .iter()
                .map(|d| {
                    let e = if d.unit.is_empty() {
                        format!("(({e}) != null ? ({e}) : undefined)", e = d.expr)
                    } else {
                        format!("((val) => typeof val === \"number\" ? val + {u} : val != null ? val : undefined)({e})", u = q(d.unit), e = d.expr)
                    };
                    format!("{}: {e}", q(&d.var_name))
                })
                .collect();
            let mut arr = vec![];
            if !statics.is_empty() {
                statics.push("$$css: true".into());
                arr.push(format!("{{{}}}", statics.join(", ")));
            }
            if !dynamics.is_empty() {
                dynamics.push("$$css: true".into());
                arr.push(format!("{{{}}}", dynamics.join(", ")));
            }
            let inline_obj = format!("{{{}}}", inline.join(", "));
            let body = if arr.is_empty() {
                format!("({inline_obj})")
            } else {
                arr.push(inline_obj);
                format!("[{}]", arr.join(", "))
            };
            format!("{}: {} => {body}", q(name), f.params)
        })
        .collect();
    format!("{{{}}}", parts.join(", "))
}

/// The variable-group file an import names (`*.stylex`, `*.stylex.ts`, ...),
/// resolved from the importing file.
fn theme_file(spec: &str, from: &str) -> Option<String> {
    const EXT: [&str; 6] = [".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs"];
    let matches = ["", ".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs"].iter().any(|e| spec.ends_with(&format!(".stylex{e}")));
    if !matches {
        return None;
    }
    if !spec.starts_with('.') {
        let ext = crate::discovery::nodepath::extname(spec);
        let base = if EXT.contains(&ext.as_str()) { &spec[..spec.len() - ext.len()] } else { spec };
        let mut cands = vec![spec.to_string()];
        cands.extend(EXT.iter().map(|e| format!("{base}{e}")));
        return cands.into_iter().find_map(|c| match crate::js::resolve::resolve(&c, std::path::Path::new(from), crate::js::resolve::Mode::Esm) {
            Ok(crate::js::resolve::Resolved::File(f)) => Some(f.to_string_lossy().to_string()),
            _ => None,
        });
    }
    let ext = crate::discovery::nodepath::extname(spec);
    let base = if EXT.contains(&ext.as_str()) { &spec[..spec.len() - ext.len()] } else { spec };
    let dir = crate::discovery::nodepath::dirname(from);
    let mut cands = vec![spec.to_string()];
    cands.extend(EXT.iter().map(|e| format!("{base}{e}")));
    cands.into_iter().map(|c| crate::discovery::nodepath::resolve(&[&dir, &c])).find(|p| crate::discovery::nodepath::is_file(p))
}
