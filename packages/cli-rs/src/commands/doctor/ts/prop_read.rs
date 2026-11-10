//! `readCodeProps` and the per-prop readers (`prop-drift.mjs`).

use super::prop_drift::{decls, file_of, fl, is_union, name_of, of_, sf_, sk, some, strongest, tf, tff, types_of, Lit};
use super::prop_origin::mapped_prop_origin;
use super::prop_types::{has_unresolved_part, indexes_for, is_any_props, is_deferred, names_from_type_parameter, takes_undefined, holders};
use super::type_match::{aliased, judge_type, union_members, JudgeCtx, Verdict};
use super::unresolved::{unresolved_reference, Unresolved};
use super::Ts;
use crate::discovery::nodepath as np;
use super::JsValue;
use std::cell::RefCell;

pub struct CodeProp {
    pub name: String,
    pub required: bool,
    pub own: bool,
    pub untraced: bool,
    pub skip_tagged: bool,
    pub declared: Vec<String>,
    pub symbols: Vec<JsValue>,
    pub intersected: bool,
    pub location: JsValue,
    source_file: JsValue,
    members: Vec<JsValue>,
    renderings: RefCell<Option<[Vec<String>; 2]>>,
    indexed: RefCell<Option<Option<Vec<JsValue>>>>,
}

impl CodeProp {
    pub fn types(&self, t: &mut Ts, checker: &JsValue) -> Vec<JsValue> {
        self.symbols.iter().map(|s| t.m(checker, "getTypeOfSymbolAtLocation", &[s.clone(), self.source_file.clone()])).collect()
    }

    pub fn indexed(&self, t: &mut Ts, checker: &JsValue) -> Option<Vec<JsValue>> {
        if let Some(v) = self.indexed.borrow().clone() {
            return v;
        }
        let mut each: Vec<Vec<JsValue>> = Vec::new();
        for m in &self.members {
            let n = t.str(&self.name);
            let p = t.m(checker, "getPropertyOfType", &[m.clone(), n]);
            if some(&p) {
                continue;
            }
            each.push(indexes_for(t, checker, std::slice::from_ref(m), &self.name));
        }
        let v = if each.iter().any(|i| i.len() > 1) {
            None
        } else {
            Some(each.into_iter().flatten().map(|info| t.get(&info, "type")).collect())
        };
        *self.indexed.borrow_mut() = Some(v.clone());
        v
    }

    pub fn renderings(&self, t: &mut Ts, checker: &JsValue) -> [Vec<String>; 2] {
        if let Some(v) = self.renderings.borrow().clone() {
            return v;
        }
        let flags = tff(t, "UseSingleQuotesForStringLiteralType") | tff(t, "UseAliasDefinedOutsideCurrentScope");
        let alias = tff(t, "InTypeAlias");
        let mut printed = Vec::new();
        let mut expanded = Vec::new();
        for s in &self.symbols {
            let pt = t.m(checker, "getTypeOfSymbolAtLocation", &[s.clone(), self.source_file.clone()]);
            for part in in_declared_order(t, checker, &pt, s) {
                let a = t.m(checker, "typeToString", &[part.clone(), self.location.clone(), JsValue::from(flags as f64)]);
                printed.push(t.s(&a));
                let b = t.m(checker, "typeToString", &[part, self.location.clone(), JsValue::from((flags | alias) as f64)]);
                expanded.push(t.s(&b));
            }
        }
        let v = [printed, expanded];
        *self.renderings.borrow_mut() = Some(v.clone());
        v
    }
}

pub struct Read {
    pub props: Vec<CodeProp>,
    pub members: Vec<JsValue>,
    pub defaults: Vec<(String, Lit)>,
}

impl Read {
    pub fn get(&self, name: &str) -> Option<&CodeProp> {
        self.props.iter().find(|p| p.name == name)
    }
    pub fn accepts(&self, t: &mut Ts, checker: &JsValue, name: &str) -> Vec<JsValue> {
        indexes_for(t, checker, &self.members, name)
    }
}

fn in_declared_order(t: &mut Ts, checker: &JsValue, ty: &JsValue, symbol: &JsValue) -> Vec<JsValue> {
    if !is_union(t, ty) {
        return vec![ty.clone()];
    }
    let mut order: Vec<JsValue> = Vec::new();
    let mut seen: Vec<JsValue> = Vec::new();
    fn visit(t: &mut Ts, checker: &JsValue, node: &JsValue, order: &mut Vec<JsValue>, seen: &mut Vec<JsValue>) {
        if t.is("isParenthesizedTypeNode", node) {
            let ty = t.get(node, "type");
            return visit(t, checker, &ty, order, seen);
        }
        if t.is("isUnionTypeNode", node) {
            let tys = t.get(node, "types");
            for x in t.items(&tys) {
                visit(t, checker, &x, order, seen);
            }
            return;
        }
        if t.is("isTypeReferenceNode", node) && !some(&t.get(node, "typeArguments")) {
            let tn = t.get(node, "typeName");
            let target = t.m(checker, "getSymbolAtLocation", &[tn]);
            let target = aliased(t, checker, &target);
            let alias = decls(t, &target).into_iter().find(|d| t.is("isTypeAliasDeclaration", d));
            if let Some(a) = alias {
                if !some(&t.get(&a, "typeParameters")) {
                    if !seen.iter().any(|s| t.same(s, &a)) {
                        seen.push(a.clone());
                        let at = t.get(&a, "type");
                        visit(t, checker, &at, order, seen);
                    }
                    return;
                }
            }
        }
        let found = t.m(checker, "getTypeFromTypeNode", &[node.clone()]);
        order.extend(union_members(t, &found));
    }
    for d in decls(t, symbol) {
        let dt = t.get(&d, "type");
        if some(&dt) {
            visit(t, checker, &dt, &mut order, &mut seen);
        }
    }
    let mut parts = types_of(t, ty);
    let place = |t: &Ts, x: &JsValue| order.iter().position(|o| t.same(o, x)).unwrap_or(order.len());
    let mut keyed: Vec<(usize, String, JsValue)> = parts
        .drain(..)
        .map(|x| {
            let p = place(t, &x);
            let s = t.m(checker, "typeToString", &[x.clone()]);
            (p, t.s(&s), x)
        })
        .collect();
    keyed.sort_by(|a, b| a.0.cmp(&b.0).then(crate::discovery::jsort::locale_compare(&a.1, &b.1)));
    keyed.into_iter().map(|(_, _, x)| x).collect()
}

fn copies_type(t: &mut Ts, checker: &JsValue, symbol: &JsValue, declaration: &JsValue, location: &JsValue) -> bool {
    let n = t.get(declaration, "name");
    if !some(&n) {
        return false;
    }
    let own = t.m(checker, "getSymbolAtLocation", &[n]);
    if !some(&own) {
        return false;
    }
    if t.same(&own, symbol) {
        return true;
    }
    let ty = t.m(checker, "getTypeOfSymbolAtLocation", &[symbol.clone(), location.clone()]);
    let declared = t.m(checker, "getTypeOfSymbolAtLocation", &[own.clone(), location.clone()]);
    if t.same(&declared, &ty) {
        return true;
    }
    // `CheckFlags.Instantiated`: a copy of another symbol for a type argument.
    if fl(t, symbol, "checkFlags") & 1 == 0 {
        return false;
    }
    let nt = tff(t, "NoTruncation") as f64;
    let a = t.m(checker, "typeToString", &[ty, location.clone(), JsValue::from(nt)]);
    let b = t.m(checker, "typeToString", &[declared, location.clone(), JsValue::from(nt)]);
    t.s(&a) == t.s(&b)
}

pub fn own_undefined(t: &mut Ts, checker: &JsValue, code: &CodeProp, exact_optional: bool) -> bool {
    if !exact_optional {
        return false;
    }
    if code.declared.iter().any(|x| crate::doctor_re!(r"\bundefined\b").find(x).is_some()) {
        return true;
    }
    let ud = t.m(checker, "getUndefinedType", &[]);
    code.types(t, checker).iter().any(|ty| union_members(t, ty).iter().any(|m| t.same(m, &ud)))
}

pub fn rendered(t: &mut Ts, checker: &JsValue, code: &CodeProp, which: usize, keep_undefined: bool) -> String {
    let parts = code.renderings(t, checker)[which].clone();
    let mut out: Vec<String> = Vec::new();
    for p in parts {
        if !code.required && p == "undefined" && !keep_undefined {
            continue;
        }
        if !out.contains(&p) {
            out.push(p);
        }
    }
    out.join(" | ")
}

pub fn code_type_text(t: &mut Ts, checker: &JsValue, code: &CodeProp, keep_undefined: bool) -> String {
    let mut written: Vec<String> = Vec::new();
    for d in &code.declared {
        if !written.contains(d) {
            written.push(d.clone());
        }
    }
    let text = if written.len() == 1 { written[0].clone() } else { rendered(t, checker, code, 0, keep_undefined) };
    use crate::commands::doctor::util::JsRe;
    crate::doctor_re!(r"\s+", "g").replace_all(&text, " ").trim_matches(crate::discovery::paths::js_ws).to_string()
}

pub struct Reading {
    pub nullable: bool,
    pub exact_optional: bool,
}

pub fn judge_members(t: &mut Ts, doc_type: &str, types: &[JsValue], ctx: &JudgeCtx) -> Verdict {
    let mut candidates: Vec<Vec<JsValue>> = vec![types.to_vec()];
    if types.len() > 1 {
        candidates.extend(types.iter().map(|x| vec![x.clone()]));
    }
    let verdicts: Vec<Verdict> = candidates.iter().map(|c| judge_type(t, doc_type, c, ctx)).collect();
    if verdicts.contains(&Verdict::Match) {
        return Verdict::Match;
    }
    if verdicts.iter().all(|v| *v == Verdict::Mismatch) {
        Verdict::Mismatch
    } else {
        Verdict::NotCompared
    }
}

pub fn judge_prop(t: &mut Ts, checker: &JsValue, program: &JsValue, doc_type: &str, code: &CodeProp, reading: &Reading) -> Verdict {
    let Some(indexed) = code.indexed(t, checker) else { return Verdict::NotCompared };
    let mut types = code.types(t, checker);
    types.extend(indexed);
    let written = if code.intersected {
        code.renderings(t, checker).to_vec()
    } else {
        let mut w = vec![code.declared.clone()];
        w.extend(code.declared.iter().map(|x| vec![x.clone()]));
        w.extend(code.renderings(t, checker).to_vec());
        w
    };
    let ctx = JudgeCtx {
        checker: checker.clone(),
        program: program.clone(),
        location: code.location.clone(),
        optional: !code.required && !reading.exact_optional,
        nullable: reading.nullable,
        exact_optional: reading.exact_optional,
        written,
    };
    judge_members(t, doc_type, &types, &ctx)
}

pub struct Entry {
    pub name: String,
    pub written: String,
    pub path: Vec<String>,
    pub spread: bool,
    pub type_: Option<String>,
    pub required: Option<bool>,
}

/// `documentedProps(raw)`.
pub fn documented_props(raw: &crate::json::Value) -> Vec<Entry> {
    let name = crate::cli::format::js_string(raw.get("name").unwrap_or(&crate::json::Value::Null));
    let names: Vec<String> = crate::doctor_re!(r"\s+/\s+").split(&name).iter().map(|x| x.trim_matches(crate::discovery::paths::js_ws).to_string()).filter(|x| !x.is_empty()).collect();
    use crate::commands::doctor::util::JsRe;
    let raw_type = raw.get("type").and_then(|v| v.as_str());
    let types: Vec<String> = raw_type.map(|t| crate::doctor_re!(r"\s+/\s+").split(t).iter().map(|x| x.to_string()).collect()).unwrap_or_default();
    let required = raw.get("required").and_then(|v| v.as_bool());
    let n = names.len();
    names
        .iter()
        .enumerate()
        .map(|(i, written)| {
            let spread = written.starts_with("...");
            let cleaned = written.replace("[]", "");
            let segs: Vec<String> = cleaned.split('.').filter(|s| !s.is_empty()).map(String::from).collect();
            let root = segs.first().cloned().unwrap_or_else(|| written.clone());
            let path: Vec<String> = segs.iter().skip(1).cloned().collect();
            let type_ = if n == 1 {
                raw.get("type").map(|v| v.as_str().map(String::from)).unwrap_or(None)
            } else if types.len() == n {
                Some(types[i].clone())
            } else {
                None
            };
            Entry { name: if spread { written.clone() } else { root }, written: written.clone(), path: if spread { vec![] } else { path }, spread, type_, required }
        })
        .collect()
}

pub struct Reached {
    pub types: Vec<JsValue>,
    pub optional: bool,
    pub ambiguous: bool,
    pub indexed: bool,
}

pub enum FieldTypes {
    Any,
    Reached(Reached),
}

/// `fieldTypes(ts, checker, code, fieldPath)`.
pub fn field_types(t: &mut Ts, checker: &JsValue, code: &CodeProp, path: &[String]) -> Option<FieldTypes> {
    let mut current = code.types(t, checker);
    let mut optional = false;
    let mut ambiguous = false;
    let mut indexed = false;
    let any_mask = tf(t, "Any") | tf(t, "Unknown");
    let opt = sf_(t, "Optional");
    for field in path {
        let mut next = Vec::new();
        optional = false;
        let mut by_name = false;
        let mut hs = Vec::new();
        for c in &current {
            hs.extend(holders(t, checker, c, 0));
        }
        for h in hs {
            if fl(t, &h, "flags") & any_mask != 0 {
                return Some(FieldTypes::Any);
            }
            let fj = t.str(field);
            let prop = t.m(checker, "getPropertyOfType", &[h.clone(), fj]);
            if some(&prop) {
                next.push(t.m(checker, "getTypeOfSymbol", &[prop.clone()]));
                if fl(t, &prop, "flags") & opt != 0 {
                    optional = true;
                }
                by_name = true;
                continue;
            }
            let idx = indexes_for(t, checker, std::slice::from_ref(&h), field);
            if idx.len() > 1 {
                ambiguous = true;
            }
            if let Some(first) = idx.first() {
                let it = t.get(first, "type");
                next.push(it.clone());
                if takes_undefined(t, &it) {
                    optional = true;
                }
            }
        }
        if next.is_empty() {
            return None;
        }
        current = next;
        indexed = !by_name;
    }
    Some(FieldTypes::Reached(Reached { types: current, optional, ambiguous, indexed }))
}

pub fn field_type_text(t: &mut Ts, checker: &JsValue, reached: &Reached, exact_optional: bool, location: &JsValue) -> Vec<String> {
    let ud = t.m(checker, "getUndefinedType", &[]);
    let u = tf(t, "Undefined");
    let q = tff(t, "UseSingleQuotesForStringLiteralType") as f64;
    let mut out: Vec<String> = Vec::new();
    for ty in &reached.types {
        for m in union_members(t, ty) {
            let own = reached.optional && fl(t, &m, "flags") & u != 0 && (!exact_optional || !t.same(&m, &ud));
            if own {
                continue;
            }
            let s = t.m(checker, "typeToString", &[m, location.clone(), JsValue::from(q)]);
            let s = t.s(&s);
            if !out.contains(&s) {
                out.push(s);
            }
        }
    }
    out
}

/// `readCodeProps(ts, program, checker, sourcePath, exportName, isOwnFile, ambient)`.
pub fn read_code_props(t: &mut Ts, program: &JsValue, checker: &JsValue, source_path: &str, export_name: &str, is_own: &dyn Fn(&str) -> bool, ambient: &Option<Unresolved>) -> Result<Read, String> {
    let spj = t.str(source_path);
    let source_file = t.m(program, "getSourceFile", &[spj]);
    let source_name = np::basename(source_path);
    if !some(&source_file) {
        return Err(format!("the compiler could not read {source_name}"));
    }
    let module = t.m(checker, "getSymbolAtLocation", &[source_file.clone()]);
    let exports = if some(&module) {
        let e = t.m(checker, "getExportsOfModule", &[module]);
        t.items(&e)
    } else {
        vec![]
    };
    use crate::commands::doctor::util::JsRe;
    let stem = crate::doctor_re!(r"\.[cm]?[jt]sx?$").replace(&source_name, "");
    let mut symbol = exports.iter().find(|s| name_of(t, s) == export_name).cloned();
    if symbol.is_none() && stem == export_name {
        symbol = exports.iter().find(|s| name_of(t, s) == "default").cloned();
    }
    let Some(mut symbol) = symbol else { return Err(format!("{source_name} has no export named {export_name}")) };
    symbol = aliased(t, checker, &symbol);
    let mut own_files: Vec<JsValue> = Vec::new();
    let mut nodes = vec![source_file.clone()];
    nodes.extend(decls(t, &symbol));
    for n in nodes {
        let sf = t.m(&n, "getSourceFile", &[]);
        let f = t.get(&sf, "fileName");
        if is_own(&t.s(&f)) {
            own_files.push(sf);
        }
    }
    let mine = |f: &str| is_own(f) || crate::doctor_re!(r"[\\/]node_modules[\\/]").find(f).is_none();
    let found = unresolved_reference(t, program, checker, &own_files, &|_| true, &mine);
    let missing = match &found {
        Some(f) if f.how != "used" => Some(f.clone()),
        _ => ambient.clone().or(found.clone()),
    };
    if let Some(m) = missing {
        let rel = np::relative(&np::dirname(source_path), &m.file);
        let where_ = if rel.is_empty() { source_name.clone() } else { rel };
        return Err(if m.how == "used" {
            format!("{export_name} depends on {} (used in {where_}), a type the compiler can't work out, so its props would be a guess. Check that the package's dependencies are installed and its types compile, then run this check again", m.name)
        } else {
            format!("{export_name} depends on {} ({} in {where_}), which the compiler could not resolve, usually a dependency that is not installed. Install the package's dependencies and run this check again", m.name, m.how)
        });
    }
    let ty = t.m(checker, "getTypeOfSymbolAtLocation", &[symbol.clone(), source_file.clone()]);
    let mut signatures: Vec<JsValue> = Vec::new();
    for u in union_members(t, &ty) {
        let a = t.m(&u, "getCallSignatures", &[]);
        signatures.extend(t.items(&a));
        let b = t.m(&u, "getConstructSignatures", &[]);
        signatures.extend(t.items(&b));
    }
    if signatures.is_empty() {
        let vd = t.get(&symbol, "valueDeclaration");
        let vdt = t.get(&vd, "type");
        let written_any = some(&vdt) && t.kind(&vdt) == sk(t, "AnyKeyword");
        let mut seen = Vec::new();
        let unresolved = !written_any && (fl(t, &ty, "flags") & tf(t, "Any") != 0 || has_unresolved_part(t, checker, &ty, 0, &mut seen));
        return Err(if unresolved {
            format!("{export_name}'s own type includes a type the compiler could not resolve, usually an import whose package is not installed (such as React's types, for a forwardRef or memo component). Install the package's dependencies and run this check again")
        } else if written_any {
            format!("{export_name} is typed `any`, so it has no props to compare")
        } else {
            format!("{export_name} in {source_name} is not a component (it cannot be called with props)")
        });
    }
    let unresolved_msg = format!("{export_name}'s props type includes a type the compiler could not resolve, usually an import whose package is not installed. Install the package's dependencies and run this check again");
    let mut props_types: Vec<JsValue> = Vec::new();
    let mut propless = false;
    for s in &signatures {
        let ps = t.m(s, "getParameters", &[]);
        let p0 = t.get_i(&ps, 0);
        if some(&p0) {
            props_types.push(t.m(checker, "getTypeOfSymbolAtLocation", &[p0, source_file.clone()]));
        } else {
            propless = true;
        }
    }
    if props_types.is_empty() {
        return Ok(Read { props: vec![], members: vec![], defaults: vec![] });
    }
    if props_types.iter().any(|p| is_any_props(t, checker, p, 0)) {
        return Err(format!("{export_name}'s props are typed `any`, so there is nothing to compare them with"));
    }
    for p in &props_types {
        let mut seen = Vec::new();
        if has_unresolved_part(t, checker, p, 0, &mut seen) {
            return Err(unresolved_msg);
        }
    }
    let nu = tf(t, "Undefined") | tf(t, "Null");
    let mut members: Vec<JsValue> = Vec::new();
    for p in &props_types {
        for m in union_members(t, p) {
            if fl(t, &m, "flags") & nu == 0 {
                members.push(m);
            }
        }
    }
    let generic = signatures.iter().any(|s| {
        let tp = t.m(s, "getTypeParameters", &[]);
        !t.items(&tp).is_empty()
    });
    let unnamed = members.iter().any(|m| is_deferred(t, checker, m, true, 0))
        && members.iter().all(|m| {
            let p = t.m(checker, "getPropertiesOfType", &[m.clone()]);
            let i = t.m(checker, "getIndexInfosOfType", &[m.clone()]);
            t.items(&p).is_empty() && t.items(&i).is_empty()
        });
    if generic && (unnamed || members.iter().any(|m| names_from_type_parameter(t, checker, m, 0))) {
        return Err(format!("{export_name}'s props take some of their names from a type parameter, such as the element it renders, so which props it accepts is known only where it is used"));
    }
    // defaultProps
    let mut holder = ty.clone();
    for _ in 0..2 {
        let tt = t.str("$$typeof");
        if !some(&t.m(checker, "getPropertyOfType", &[holder.clone(), tt])) {
            break;
        }
        let (a, b) = (t.str("type"), t.str("_result"));
        let mut inner = t.m(checker, "getPropertyOfType", &[holder.clone(), a]);
        if !some(&inner) {
            inner = t.m(checker, "getPropertyOfType", &[holder.clone(), b]);
        }
        if !some(&inner) {
            break;
        }
        holder = t.m(checker, "getTypeOfSymbolAtLocation", &[inner, source_file.clone()]);
    }
    let dpj = t.str("defaultProps");
    let default_props = t.m(checker, "getPropertyOfType", &[holder.clone(), dpj]);
    let has_own_default = some(&default_props) && decls(t, &default_props).iter().any(|d| is_own(&file_of(t, d)));
    let defaults = if has_own_default { Some(t.m(checker, "getTypeOfSymbolAtLocation", &[default_props.clone(), source_file.clone()])) } else { None };
    let fills_all = defaults.as_ref().map(|d| fl(t, d, "flags") & tf(t, "Any") != 0).unwrap_or(false);
    let mut defaulted: Vec<String> = match &defaults {
        Some(d) => {
            let p = t.m(checker, "getPropertiesOfType", &[d.clone()]);
            t.items(&p).iter().map(|s| name_of(t, s)).collect()
        }
        None => vec![],
    };
    let optional_flag = sf_(t, "Optional");
    let mut by_name: Vec<(String, Vec<JsValue>, usize, Vec<JsValue>)> = Vec::new();
    for m in &members {
        let ps = t.m(checker, "getPropertiesOfType", &[m.clone()]);
        for p in t.items(&ps) {
            let n = name_of(t, &p);
            let o = fl(t, &p, "flags") & optional_flag != 0;
            match by_name.iter_mut().find(|(k, _, _, _)| *k == n) {
                Some(e) => {
                    e.1.push(p);
                    e.3.push(m.clone());
                    if o {
                        e.2 += 1;
                    }
                }
                None => by_name.push((n, vec![p], o as usize, vec![m.clone()])),
            }
        }
    }
    if fills_all {
        for (n, _, _, _) in &by_name {
            defaulted.push(n.clone());
        }
    }
    let mut starts = vec![{
        let vd = t.get(&symbol, "valueDeclaration");
        if some(&vd) { vd } else { decls(t, &symbol).first().cloned().unwrap_or_default() }
    }];
    let mut sigs = signatures.clone();
    if !t.same(&holder, &ty) {
        let hs = t.m(&holder, "getCallSignatures", &[]);
        sigs.extend(t.items(&hs));
    }
    for s in &sigs {
        let ps = t.m(s, "getParameters", &[]);
        let p0 = t.get_i(&ps, 0);
        starts.push(t.get(&p0, "valueDeclaration"));
    }
    let mut origins = None;
    let mut props = Vec::new();
    for (name, symbols, optional, containers) in by_name {
        let mut declarations: Vec<JsValue> = Vec::new();
        for s in &symbols {
            declarations.extend(decls(t, s));
        }
        let own_decls: Vec<JsValue> = declarations.iter().filter(|d| is_own(&file_of(t, d))).cloned().collect();
        let built = if declarations.is_empty() {
            let o = origins.get_or_insert_with(|| mapped_prop_origin(t, checker, is_own, &starts));
            let found: Vec<Option<&'static str>> = symbols.iter().zip(&containers).map(|(s, c)| Some(o.origin(t, s, c))).collect();
            strongest(&found)
        } else {
            None
        };
        let required = !defaulted.contains(&name) && !propless && symbols.len() == members.len() && optional == 0;
        let skip_tagged = own_decls.iter().any(|d| {
            let tags = t.f("getJSDocTags", std::slice::from_ref(d));
            t.items(&tags).iter().any(|tag| {
                let tn = t.get(tag, "tagName");
                super::prop_drift::text_of(t, &tn) == "internal"
            })
        });
        let mut declared = Vec::new();
        for s in &symbols {
            for d in decls(t, s) {
                let dt = t.get(&d, "type");
                if contains_js(t, &own_decls, &d) && some(&dt) && !t.is("isMethodSignature", &d) && !t.is("isMethodDeclaration", &d) && copies_type(t, checker, s, &d, &source_file) {
                    let sf = t.m(&d, "getSourceFile", &[]);
                    let tx = t.m(&dt, "getText", &[sf]);
                    declared.push(t.s(&tx));
                }
            }
        }
        let intersected = symbols.iter().any(|s| decls(t, s).iter().filter(|d| some(&t.get(d, "type"))).count() > 1);
        props.push(CodeProp {
            name,
            required,
            own: !own_decls.is_empty() || built == Some("own"),
            untraced: declarations.is_empty() && built != Some("own") && built != Some("foreign"),
            skip_tagged,
            declared,
            symbols,
            intersected,
            location: own_decls.first().cloned().unwrap_or_else(|| source_file.clone()),
            source_file: source_file.clone(),
            members: members.clone(),
            renderings: RefCell::new(None),
            indexed: RefCell::new(None),
        });
    }
    let defaults = super::prop_drift::literal_defaults_pub(t, &symbol);
    Ok(Read { props, members, defaults })
}

fn contains_js(t: &Ts, list: &[JsValue], v: &JsValue) -> bool {
    list.iter().any(|x| t.same(x, v))
}
