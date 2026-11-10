//! `comparePropTables` and `comparePropDocs` (`prop-drift.mjs`).

use super::package_tsconfig::open_package_project;
use super::prop_drift::{some, text_of, tff, Lit, PROPS_NOT_DOCUMENTED};
use super::prop_read::*;
use super::prop_types::takes_undefined;
use super::type_match::{judge_type, JudgeCtx, Verdict};
use super::unresolved::unresolved_globals;
use super::Ts;
use crate::discovery::nodepath as np;
use crate::json::{Map, Value};
use super::JsValue;

pub const MISSING_REASON: &str = "TypeScript is not installed in this project, so documented props were not compared with the code.";
const NOT_EXACT: &str = "not a form the check judges exactly";
const VARIANTS: &str = "the prop's variants give this field different types";
const CODE_DEFAULT_NOT_LITERAL: &str = "its default in the code is not a literal, so the documented default was not compared";
const DOC_DEFAULT_NOT_LITERAL: &str = "its documented default is not a literal, so it was not compared with the code's";

pub struct Table {
    pub doc: String,
    pub name: String,
    pub props: Vec<Value>,
    pub sources: Vec<String>,
}

fn outside(name: &str, code: Option<&CodeProp>) -> String {
    if code.map(|c| c.untraced).unwrap_or(false) {
        NOT_EXACT.into()
    } else if PROPS_NOT_DOCUMENTED.contains(&name) {
        "standard prop, not compared".into()
    } else {
        "declared outside the package, not compared".into()
    }
}

fn s(v: &str) -> Value {
    Value::String(v.into())
}

fn empty(status: &str, extra: Vec<(&str, Value)>) -> Value {
    let mut m = Map::new();
    m.insert("status".into(), s(status));
    let mut unchecked = Value::Array(vec![]);
    for (k, v) in extra {
        if k == "unchecked" {
            unchecked = v;
        } else {
            m.insert(k.into(), v);
        }
    }
    m.insert("components".into(), Value::from(0));
    m.insert("typesCompared".into(), Value::from(0));
    m.insert("findings".into(), Value::Array(vec![]));
    m.insert("unchecked".into(), unchecked);
    m.insert("typesNotCompared".into(), Value::Array(vec![]));
    Value::Object(m)
}

fn documented_default(written: &Value) -> Option<Lit> {
    match written {
        Value::Number(n) => Some(Lit::Num(n.as_f64().unwrap_or(f64::NAN))),
        Value::Bool(b) => Some(Lit::Bool(*b)),
        Value::Null => Some(Lit::Null),
        Value::String(x) => {
            let text = x.trim_matches(crate::discovery::paths::js_ws);
            if let Some(m) = crate::doctor_re!(r"^(['\x22`])([^'\x22`]*)\1$").find(text) {
                return Some(Lit::Str(text[m.group(2).unwrap()].to_string()));
            }
            if crate::doctor_re!(r"^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$", "i").find(text).is_some() {
                return Some(Lit::Num(crate::discovery::semver::js_number(text)));
            }
            match text {
                "true" => Some(Lit::Bool(true)),
                "false" => Some(Lit::Bool(false)),
                "null" => Some(Lit::Null),
                _ => None,
            }
        }
        _ => None,
    }
}

fn lit_text(v: &Lit) -> String {
    match v {
        Lit::Str(x) => format!("'{x}'"),
        Lit::Num(n) => crate::json::js_number_to_string(*n),
        Lit::Bool(b) => b.to_string(),
        Lit::Null => "null".into(),
        Lit::NotLiteral => String::new(),
    }
}

fn lit_eq(a: &Lit, b: &Lit) -> bool {
    a == b
}

/// `comparePropTables(tables, {packageDir, resolveFrom})`.
pub fn compare_prop_tables(tables: &[Table], package_dir: &str, resolve_from: &[&str]) -> Value {
    if super::project_typescript(resolve_from).is_none() {
        return empty("skipped", vec![("reason", s(&format!("{MISSING_REASON} {}", super::TYPESCRIPT_FIX)))]);
    }
    if tables.is_empty() {
        return empty("checked", vec![("typescript", s(&crate::ts7::session::native_version()))]);
    }
    match super::with_session(&np::resolve1(package_dir), |t| {
        let version = t.version.clone();
        compare_with(t, &version, tables, package_dir)
    }) {
        Ok(v) => v,
        Err(e) => empty("skipped", vec![("reason", s(&crate::ts7::session::failed_reason(&e, "documented props were not compared with the code")))]),
    }
}

fn finding(base: &[(&str, Value)], extra: Vec<(&str, Value)>) -> (String, String, String, Value) {
    let mut m = Map::new();
    for (k, v) in base.iter().cloned().chain(extra) {
        m.insert(k.to_string(), v);
    }
    let get = |k: &str| m.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
    (get("component"), get("prop"), get("kind"), Value::Object(m))
}

fn compare_with(t: &mut Ts, version: &str, tables: &[Table], package_dir: &str) -> Value {
    let root = std::fs::canonicalize(np::resolve1(package_dir)).map(|p| p.to_string_lossy().into_owned()).unwrap_or_else(|_| np::resolve1(package_dir));
    let lc = crate::discovery::jsort::locale_compare;
    let mut unchecked: Vec<(String, String, String)> = Vec::new();
    let unchecked_json = |u: &mut Vec<(String, String, String)>| -> Value {
        u.sort_by(|a, b| lc(&a.0, &b.0));
        Value::Array(
            u.iter()
                .map(|(c, d, r)| {
                    let mut m = Map::new();
                    m.insert("component".into(), s(c));
                    m.insert("doc".into(), s(d));
                    m.insert("reason".into(), s(r));
                    Value::Object(m)
                })
                .collect(),
        )
    };
    if tables.is_empty() {
        return empty("checked", vec![("typescript", s(version))]);
    }
    let all_sources: Vec<String> = tables.iter().flat_map(|x| x.sources.clone()).collect();
    let opened = open_package_project(t, package_dir, &all_sources);
    if let Some(err) = &opened.error {
        for table in tables {
            unchecked.push((table.name.clone(), table.doc.clone(), format!("the package's TypeScript config has an error, so props were not read ({err})")));
        }
        let u = unchecked_json(&mut unchecked);
        return empty("checked", vec![("typescript", s(version)), ("unchecked", u)]);
    }
    let Some(project) = opened.project.clone() else { return empty("checked", vec![("typescript", s(version))]) };
    t.adapt(project);
    let program = JsValue::Program;
    let checker = JsValue::Checker;
    let own_cache: std::cell::RefCell<Vec<(String, bool)>> = std::cell::RefCell::new(Vec::new());
    let is_own = |file: &str| -> bool {
        if let Some((_, v)) = own_cache.borrow().iter().find(|(k, _)| k == file) {
            return *v;
        }
        let real = std::fs::canonicalize(file).map(|p| p.to_string_lossy().into_owned()).unwrap_or_else(|_| file.to_string());
        let rel = np::relative(&root, &real);
        let v = !rel.is_empty() && !rel.starts_with("..") && !np::is_absolute(&rel) && !rel.split('/').any(|x| x == "node_modules");
        own_cache.borrow_mut().push((file.to_string(), v));
        v
    };
    // The config the package's own options come from, as messages name it.
    let co = super::from_json(&opened.options);
    let co = if matches!(co, JsValue::Obj(_)) { co } else { t.obj(vec![]) };
    let cfp = match &opened.config_path {
        Some(c) => t.str(c),
        None => JsValue::Undefined,
    };
    t.set(&co, "configFilePath", cfp);
    t.compiler_options = co.clone();
    let ambient = unresolved_globals(t, &program, &checker, &opened.declarations, &co, &is_own);
    let sn = t.get(&co, "strictNullChecks");
    let st = t.get(&co, "strict");
    let strict_null = if some(&sn) {
        sn.to_boolean()
    } else if some(&st) {
        st.to_boolean()
    } else {
        true
    };
    let nullable = !strict_null;
    let eopt = t.get(&co, "exactOptionalPropertyTypes");
    let reading = Reading { nullable, exact_optional: !nullable && eopt.as_boolean() == Some(true) };
    // Every documented type is parsed in one request, ahead of the judging.
    let mut texts: Vec<(String, String)> = Vec::new();
    for table in tables {
        for raw in &table.props {
            let Some(ty) = raw.get("type").and_then(|v| v.as_str()) else { continue };
            let mut parts = vec![ty.to_string()];
            let split = crate::doctor_re!(r"\s+\/\s+", "g");
            let mut last = 0;
            for m in split.find_iter(ty) {
                parts.push(ty[last..m.start()].to_string());
                last = m.end();
            }
            parts.push(ty[last..].to_string());
            for text in parts {
                texts.push(("type-text.ts".into(), format!("type T = {text}\n;")));
                texts.push(("__documented_type__.ts".into(), format!("type __Documented = {text};")));
            }
        }
    }
    t.prefetch(&texts);
    let mut findings: Vec<(String, String, String, Value)> = Vec::new();
    let mut props_not_checked: Vec<(String, String, String, Vec<String>)> = Vec::new();
    let mut compared = 0usize;
    let mut types_compared = 0usize;
    let mut types_not_compared: Vec<(String, String, String, Vec<String>)> = Vec::new();
    let q = tff(t, "UseSingleQuotesForStringLiteralType") as f64;
    for table in tables {
        let mut read: Option<Result<Read, String>> = None;
        let mut source_path = table.sources.first().cloned().unwrap_or_default();
        for cand in &table.sources {
            let attempt = read_code_props(t, &program, &checker, cand, &table.name, &is_own, &ambient);
            let ok = attempt.is_ok();
            if ok || read.is_none() {
                read = Some(attempt);
                source_path = cand.clone();
            }
            if ok {
                break;
            }
        }
        let read = match read {
            Some(Ok(r)) => r,
            Some(Err(reason)) => {
                unchecked.push((table.name.clone(), table.doc.clone(), reason));
                continue;
            }
            None => {
                unchecked.push((table.name.clone(), table.doc.clone(), format!("no source file for {}", table.name)));
                continue;
            }
        };
        compared += 1;
        let source = np::relative(package_dir, &source_path);
        let mut documented: Vec<String> = Vec::new();
        let mut not_compared: Vec<(String, Vec<String>)> = Vec::new();
        let mut skip = |reason: String, name: &str| match not_compared.iter_mut().find(|(r, _)| *r == reason) {
            Some(e) => {
                if !e.1.contains(&name.to_string()) {
                    e.1.push(name.into());
                }
            }
            None => not_compared.push((reason, vec![name.into()])),
        };
        for raw in &table.props {
            if !raw.get("name").map(|v| v.is_string()).unwrap_or(false) {
                continue;
            }
            let entries = documented_props(raw);
            let n_entries = entries.len();
            for mut entry in entries {
                let prop_name = entry.name.clone();
                if entry.spread {
                    continue;
                }
                let doc_type = entry.type_.clone();
                if !documented.contains(&prop_name) {
                    documented.push(prop_name.clone());
                }
                let code = read.get(&prop_name);
                let reached = match code {
                    Some(c) if !entry.path.is_empty() => field_types(t, &checker, c, &entry.path),
                    _ => None,
                };
                let raw_type_is_string = raw.get("type").map(|v| v.is_string()).unwrap_or(false);
                if entry.type_.is_none() && raw_type_is_string {
                    let cond = match code {
                        Some(_) if !entry.path.is_empty() => reached.is_some(),
                        Some(_) => true,
                        None => !read.accepts(t, &checker, &prop_name).is_empty(),
                    };
                    if cond {
                        let reason = if code.map(|c| !c.own).unwrap_or(false) { outside(&prop_name, code) } else { NOT_EXACT.into() };
                        skip(reason, &entry.written);
                    }
                }
                let base: Vec<(&str, Value)> = vec![("component", s(&table.name)), ("prop", s(&entry.written)), ("severity", s("warning")), ("doc", s(&table.doc)), ("source", s(&source))];
                if !entry.path.is_empty() {
                    if let (Some(c), Some(_), Some(_)) = (code, &reached, &entry.type_) {
                        if !c.own {
                            skip(outside(&prop_name, code), &entry.written);
                        }
                    }
                    if let Some(FieldTypes::Any) = reached {
                        if code.map(|c| c.own).unwrap_or(false) && entry.type_.is_some() {
                            skip(NOT_EXACT.into(), &entry.written);
                        }
                        continue;
                    }
                    if let (Some(c), Some(FieldTypes::Reached(r))) = (code, &reached) {
                        let field_text = field_type_text(t, &checker, r, reading.exact_optional, &c.location);
                        let ctx = JudgeCtx {
                            checker: checker.clone(),
                            program: program.clone(),
                            location: c.location.clone(),
                            optional: r.optional && (!reading.exact_optional || r.indexed),
                            nullable: reading.nullable,
                            exact_optional: reading.exact_optional,
                            written: vec![field_text.clone()],
                        };
                        let verdict = match (&entry.type_, c.own) {
                            (Some(ty), true) => Some(if r.ambiguous { Verdict::NotCompared } else { judge_type(t, ty, &r.types, &ctx) }),
                            _ => None,
                        };
                        let mut variants: Vec<JsValue> = Vec::new();
                        for x in &r.types {
                            if !variants.iter().any(|v| t.same(v, x)) {
                                variants.push(x.clone());
                            }
                        }
                        let some_variants = matches!(verdict, Some(Verdict::Mismatch) | Some(Verdict::NotCompared))
                            && !r.ambiguous
                            && variants.len() > 1
                            && (variants.len() > 6 || {
                                let n = variants.len();
                                let doc = entry.type_.clone().unwrap_or_default();
                                (0..(1usize << n) - 2).any(|i| {
                                    let subset: Vec<JsValue> = variants.iter().enumerate().filter(|(j, _)| ((i + 1) >> j) & 1 == 1).map(|(_, v)| v.clone()).collect();
                                    judge_type(t, &doc, &subset, &ctx) == Verdict::Match
                                })
                            });
                        if some_variants {
                            skip(VARIANTS.into(), &entry.written);
                        } else if verdict == Some(Verdict::NotCompared) {
                            skip(NOT_EXACT.into(), &entry.written);
                        } else if verdict.is_some() {
                            types_compared += 1;
                        }
                        if verdict == Some(Verdict::Mismatch) && !some_variants {
                            let code_type = field_text.join(" | ");
                            let ty = entry.type_.clone().unwrap_or_default();
                            findings.push(finding(
                                &base,
                                vec![
                                    ("kind", s("type_mismatch")),
                                    ("message", s(&format!("\"{}\" is documented as {ty}, but the code declares {code_type}.", entry.written))),
                                    ("docType", s(&ty)),
                                    ("codeType", s(&code_type)),
                                ],
                            ));
                        }
                        continue;
                    }
                    if code.is_none() && !read.accepts(t, &checker, &prop_name).is_empty() {
                        if entry.type_.is_some() {
                            skip(NOT_EXACT.into(), &entry.written);
                        }
                        continue;
                    }
                    let message = if code.is_some() {
                        format!("\"{}\" is documented, but {}'s \"{prop_name}\" has no \"{}\".", entry.written, table.name, entry.path.join("."))
                    } else {
                        format!("\"{}\" is documented, but {}'s props have no \"{prop_name}\".", entry.written, table.name)
                    };
                    findings.push(finding(&base, vec![("kind", s("not_in_code")), ("message", s(&message))]));
                    continue;
                }
                let Some(code) = code else {
                    let indexes = read.accepts(t, &checker, &prop_name);
                    let own: Vec<JsValue> = indexes
                        .iter()
                        .filter(|i| {
                            let d = t.get(i, "declaration");
                            some(&d) && is_own(&super::prop_drift::file_of(t, &d))
                        })
                        .cloned()
                        .collect();
                    let index = if indexes.len() == 1 { own.first().cloned() } else { None };
                    if !indexes.is_empty() && index.is_none() && entry.type_.is_some() {
                        let declared = indexes.iter().all(|i| some(&t.get(i, "declaration")));
                        let reason = if !own.is_empty() || !declared { NOT_EXACT.to_string() } else { outside(&prop_name, None) };
                        skip(reason, &prop_name);
                    }
                    if let (Some(idx), Some(ty)) = (&index, &entry.type_) {
                        let it = t.get(idx, "type");
                        let decl = t.get(idx, "declaration");
                        let printed = {
                            let v = t.m(&checker, "typeToString", &[it.clone(), decl.clone(), JsValue::from(q)]);
                            t.s(&v)
                        };
                        let ctx = JudgeCtx {
                            checker: checker.clone(),
                            program: program.clone(),
                            location: decl.clone(),
                            optional: takes_undefined(t, &it),
                            nullable: reading.nullable,
                            exact_optional: reading.exact_optional,
                            written: vec![vec![printed.clone()]],
                        };
                        let verdict = judge_type(t, ty, std::slice::from_ref(&it), &ctx);
                        if verdict == Verdict::NotCompared {
                            skip(NOT_EXACT.into(), &prop_name);
                        } else {
                            types_compared += 1;
                        }
                        if verdict == Verdict::Mismatch {
                            findings.push(finding(
                                &base,
                                vec![
                                    ("kind", s("type_mismatch")),
                                    ("message", s(&format!("\"{prop_name}\" is documented as {ty}, but {}'s props take it as {printed}.", table.name))),
                                    ("docType", s(ty)),
                                    ("codeType", s(&printed)),
                                ],
                            ));
                        }
                    }
                    if !indexes.is_empty() {
                        continue;
                    }
                    let mut extra = vec![("kind", s("not_in_code")), ("message", s(&format!("\"{prop_name}\" is documented, but {}'s props have no \"{prop_name}\".", table.name)))];
                    if let Some(dt) = &doc_type {
                        extra.push(("docType", s(dt)));
                    }
                    findings.push(finding(&base, extra));
                    continue;
                };
                let doc_required = entry.required == Some(true);
                if doc_required != code.required {
                    let message = if code.required {
                        format!("\"{prop_name}\" is required in the code, but the doc does not mark it required.")
                    } else {
                        format!("\"{prop_name}\" is documented as required, but it is optional in the code.")
                    };
                    findings.push(finding(&base, vec![("kind", s("required_mismatch")), ("message", s(&message)), ("docRequired", Value::Bool(doc_required)), ("codeRequired", Value::Bool(code.required))]));
                }
                let code_default = read.defaults.iter().find(|(k, _)| *k == prop_name).map(|(_, v)| v.clone());
                let raw_default = raw.get("default");
                let doc_writes = n_entries == 1 && raw_default.is_some() && raw_default != Some(&Value::String(String::new()));
                let doc_default = if doc_writes { documented_default(raw_default.unwrap()) } else { None };
                if let (Some(cd), true) = (&code_default, doc_writes) {
                    if *cd == Lit::NotLiteral {
                        skip(CODE_DEFAULT_NOT_LITERAL.into(), &prop_name);
                    } else if doc_default.is_none() {
                        skip(DOC_DEFAULT_NOT_LITERAL.into(), &prop_name);
                    }
                }
                if let (Some(cd), Some(dd)) = (&code_default, &doc_default) {
                    if *cd != Lit::NotLiteral && !lit_eq(cd, dd) {
                        let shown = lit_text(cd);
                        let written = crate::cli::format::js_string(raw_default.unwrap());
                        findings.push(finding(
                            &base,
                            vec![
                                ("kind", s("default_mismatch")),
                                ("message", s(&format!("\"{prop_name}\" is documented with default {}, but the code defaults it to {shown}.", written.trim_matches(crate::discovery::paths::js_ws)))),
                                ("fix", s(&format!("In {}, set the \"{prop_name}\" prop's default to the code's: default: {}.", table.doc, crate::json::stringify(&Value::String(shown.clone()), 0)))),
                                ("docDefault", s(&written)),
                                ("codeDefault", s(&shown)),
                            ],
                        ));
                    }
                }
                if !code.own && entry.type_.is_some() {
                    skip(outside(&prop_name, Some(code)), &prop_name);
                }
                if let (true, Some(ty)) = (code.own, &entry.type_) {
                    let verdict = judge_prop(t, &checker, &program, ty, code, &reading);
                    if verdict == Verdict::NotCompared {
                        skip(NOT_EXACT.into(), &prop_name);
                    } else {
                        types_compared += 1;
                    }
                    if verdict == Verdict::Mismatch {
                        let keep = own_undefined(t, &checker, code, reading.exact_optional);
                        let code_type = code_type_text(t, &checker, code, keep);
                        let expanded = rendered(t, &checker, code, 1, keep);
                        let bare = code_type.split(" | ").filter(|p| *p != "undefined").collect::<Vec<_>>().join(" | ");
                        let shown = if !expanded.is_empty() && expanded != code_type && expanded != bare {
                            let e16: Vec<u16> = expanded.encode_utf16().collect();
                            let ex = if e16.len() <= 400 { expanded.clone() } else { format!("{}…", String::from_utf16_lossy(&e16[..400])) };
                            format!("{code_type} ({ex})")
                        } else {
                            code_type.clone()
                        };
                        findings.push(finding(
                            &base,
                            vec![
                                ("kind", s("type_mismatch")),
                                ("message", s(&format!("\"{prop_name}\" is documented as {ty}, but the code declares {shown}."))),
                                ("docType", s(ty)),
                                ("codeType", s(&code_type)),
                            ],
                        ));
                    }
                }
            }
        }
        let mut untraced: Vec<String> = Vec::new();
        for code in &read.props {
            if documented.contains(&code.name) || code.skip_tagged || PROPS_NOT_DOCUMENTED.contains(&code.name.as_str()) {
                continue;
            }
            if !code.own {
                if code.untraced {
                    untraced.push(code.name.clone());
                }
                continue;
            }
            let keep = own_undefined(t, &checker, code, reading.exact_optional);
            let code_type = code_type_text(t, &checker, code, keep);
            let base: Vec<(&str, Value)> = vec![("component", s(&table.name)), ("prop", s(&code.name))];
            findings.push(finding(
                &base,
                vec![
                    ("kind", s("not_in_doc")),
                    ("severity", s("warning")),
                    ("message", s(&format!("{} declares \"{}\", but the doc does not list it.", table.name, code.name))),
                    ("doc", s(&table.doc)),
                    ("source", s(&source)),
                    ("codeType", s(&code_type)),
                    ("codeRequired", Value::Bool(code.required)),
                ],
            ));
        }
        if !untraced.is_empty() {
            untraced.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            props_not_checked.push((
                table.name.clone(),
                table.doc.clone(),
                "a mapped type builds them from keys the check can't trace to the package's source, so it did not check that the doc lists them".into(),
                untraced,
            ));
        }
        for (reason, mut props) in not_compared {
            props.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            types_not_compared.push((table.name.clone(), table.doc.clone(), reason, props));
        }
    }
    findings.sort_by(|a, b| lc(&a.0, &b.0).then(lc(&a.1, &b.1)).then(lc(&a.2, &b.2)));
    types_not_compared.sort_by(|a, b| lc(&a.0, &b.0).then(lc(&a.2, &b.2)));
    let group = |list: &[(String, String, String, Vec<String>)]| -> Value {
        Value::Array(
            list.iter()
                .map(|(c, d, r, p)| {
                    let mut m = Map::new();
                    m.insert("component".into(), s(c));
                    m.insert("doc".into(), s(d));
                    m.insert("reason".into(), s(r));
                    m.insert("props".into(), Value::Array(p.iter().map(|x| s(x)).collect()));
                    Value::Object(m)
                })
                .collect(),
        )
    };
    let mut m = Map::new();
    m.insert("status".into(), s("checked"));
    m.insert("typescript".into(), s(version));
    m.insert("components".into(), Value::from(compared));
    m.insert("typesCompared".into(), Value::from(types_compared));
    m.insert("findings".into(), Value::Array(findings.into_iter().map(|f| f.3).collect()));
    m.insert("unchecked".into(), unchecked_json(&mut unchecked));
    m.insert("typesNotCompared".into(), group(&types_not_compared));
    if !props_not_checked.is_empty() {
        m.insert("propsNotChecked".into(), group(&props_not_checked));
    }
    let _ = text_of;
    Value::Object(m)
}

pub struct Component {
    pub name: String,
    pub doc_path: String,
    pub source_path: Option<String>,
}

fn hook_name(n: &str) -> bool {
    crate::doctor_re!(r"^use[A-Z0-9]").find(n).is_some()
}

fn own_name(doc: &Value, component: &Component) -> String {
    match doc.get("name").and_then(|v| v.as_str()) {
        Some(n) if !n.is_empty() => n.to_string(),
        _ => component.name.clone(),
    }
}

fn doc_stem(doc_path: &str) -> String {
    use crate::commands::doctor::util::JsRe;
    crate::doctor_re!(r"\.doc\.(ts|mjs|js)$").replace(&np::basename(doc_path), "")
}

fn prop_tables(doc: &Value, component: &Component) -> Vec<(String, Vec<Value>)> {
    let mut tables = Vec::new();
    if !doc.is_object() {
        return tables;
    }
    let own = own_name(doc, component);
    let props = doc.get("props").and_then(|v| v.as_array());
    if let Some(p) = props {
        if !hook_name(&own) {
            tables.push((own.clone(), p.clone()));
        }
    }
    if let Some(cs) = doc.get("components").and_then(|v| v.as_array()) {
        for e in cs {
            let Some(name) = e.get("name").and_then(|v| v.as_str()) else { continue };
            let Some(ep) = e.get("props").and_then(|v| v.as_array()) else { continue };
            if !(props.is_some() && name == own) && !hook_name(name) {
                tables.push((name.to_string(), ep.clone()));
            }
        }
    }
    tables
}

fn sources_for_entry(name: &str, component: &Component) -> Vec<String> {
    let own: Vec<String> = component.source_path.iter().cloned().collect();
    if name == component.name {
        return own;
    }
    let dir = np::dirname(&component.doc_path);
    let mut cands: Vec<String> = vec![np::join2(&dir, &format!("{name}.tsx"))];
    cands.extend(own);
    cands.push(np::join2(&dir, "index.ts"));
    cands.push(np::join2(&dir, "index.tsx"));
    if let Some(f) = crate::discovery::component_discovery::folder_source_for(std::path::Path::new(&dir), name) {
        cands.push(f.to_string_lossy().into_owned());
    }
    let mut out: Vec<String> = Vec::new();
    for c in cands {
        if !out.contains(&c) && np::exists(&c) {
            out.push(c);
        }
    }
    out
}

/// `comparePropDocs(components, {packageDir, resolveFrom})`.
pub fn compare_prop_docs(components: &[Component], package_dir: &str, resolve_from: &[&str]) -> Value {
    let rel = |f: &str| np::relative(package_dir, f);
    let mut tables: Vec<Table> = Vec::new();
    let mut unchecked: Vec<(String, String, String)> = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    let mut names_by_doc: Vec<(String, Vec<String>)> = Vec::new();
    for c in components {
        match names_by_doc.iter_mut().find(|(d, _)| *d == c.doc_path) {
            Some(e) => {
                if !e.1.contains(&c.name) {
                    e.1.push(c.name.clone())
                }
            }
            None => names_by_doc.push((c.doc_path.clone(), vec![c.name.clone()])),
        }
    }
    let mut docs: Vec<(String, Result<Value, String>)> = Vec::new();
    let mut owned: Vec<String> = Vec::new();
    let compare_own = |c: &Component, doc: &Value, tables: &mut Vec<Table>, seen: &mut Vec<String>| {
        let members = names_by_doc.iter().find(|(d, _)| *d == c.doc_path).map(|(_, n)| n.clone()).unwrap_or_default();
        for (name, props) in prop_tables(doc, c) {
            if name != c.name && members.contains(&name) {
                continue;
            }
            let sources = sources_for_entry(&name, c);
            let key = format!("{}\0{}\0{name}", c.doc_path, sources.first().cloned().unwrap_or_else(|| "undefined".into()));
            if seen.contains(&key) {
                continue;
            }
            seen.push(key);
            tables.push(Table { doc: rel(&c.doc_path), name, props, sources });
        }
    };
    for c in components {
        let doc = match docs.iter().find(|(d, _)| *d == c.doc_path) {
            Some((_, r)) => r.clone(),
            None => {
                let r = crate::discovery::component_discovery::load_component_doc_strict(std::path::Path::new(&c.doc_path)).map_err(|e| e.to_string());
                docs.push((c.doc_path.clone(), r.clone()));
                r
            }
        };
        let doc = match doc {
            Ok(d) => d,
            Err(e) => {
                unchecked.push((c.name.clone(), rel(&c.doc_path), format!("its doc does not load: {e}")));
                continue;
            }
        };
        let own_record = c.name == doc_stem(&c.doc_path) || (doc.is_object() && own_name(&doc, c) == c.name);
        if !own_record {
            let entry = doc.get("components").and_then(|v| v.as_array()).and_then(|cs| cs.iter().find(|e| e.get("name").and_then(|v| v.as_str()) == Some(c.name.as_str()) && e.get("props").map(|p| p.is_array()).unwrap_or(false)).cloned());
            let Some(entry) = entry else { continue };
            if hook_name(&c.name) {
                continue;
            }
            let key = format!("{}\0{}\0{}", c.doc_path, c.source_path.clone().unwrap_or_else(|| "null".into()), c.name);
            if seen.contains(&key) {
                continue;
            }
            seen.push(key);
            tables.push(Table {
                doc: rel(&c.doc_path),
                name: c.name.clone(),
                props: entry.get("props").and_then(|v| v.as_array()).cloned().unwrap_or_default(),
                sources: c.source_path.iter().cloned().collect(),
            });
            continue;
        }
        owned.push(c.doc_path.clone());
        compare_own(c, &doc, &mut tables, &mut seen);
    }
    for (doc_path, r) in docs.clone() {
        if owned.contains(&doc_path) {
            continue;
        }
        let Ok(doc) = r else { continue };
        if !doc.is_object() {
            continue;
        }
        let c = Component { name: doc_stem(&doc_path), doc_path: doc_path.clone(), source_path: None };
        compare_own(&c, &doc, &mut tables, &mut seen);
    }
    let mut report = compare_prop_tables(&tables, package_dir, resolve_from);
    if report.get("status").and_then(|v| v.as_str()) == Some("skipped") {
        return report;
    }
    if let Value::Object(m) = &mut report {
        let mut all: Vec<Value> = unchecked
            .into_iter()
            .map(|(c, d, r)| {
                let mut x = Map::new();
                x.insert("component".into(), s(&c));
                x.insert("doc".into(), s(&d));
                x.insert("reason".into(), s(&r));
                Value::Object(x)
            })
            .collect();
        all.extend(m.get("unchecked").and_then(|v| v.as_array()).cloned().unwrap_or_default());
        all.sort_by(|a, b| crate::discovery::jsort::locale_compare(a.get("component").and_then(|v| v.as_str()).unwrap_or(""), b.get("component").and_then(|v| v.as_str()).unwrap_or("")));
        m.insert("unchecked".into(), Value::Array(all));
    }
    report
}
