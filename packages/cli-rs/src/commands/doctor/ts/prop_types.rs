//! Type predicates prop drift reads (`prop-drift.mjs`): deferred types,
//! index signatures, `any` props and unresolved parts.

use super::prop_drift::{decls, fl, is_inter, is_union, of_, sf_, sk, some, text_of, tf, types_of};
use super::type_match::aliased;
use super::Ts;
use super::JsValue;

/// `isErrorType(ts, type)`.
pub fn is_error_type(t: &mut Ts, ty: &JsValue) -> bool {
    if fl(t, ty, "flags") & tf(t, "Any") == 0 {
        return false;
    }
    let n = t.get(ty, "intrinsicName");
    t.opt_s(&n).as_deref() == Some("error")
}

/// `isDeferred(ts, checker, t, deep, depth)`.
pub fn is_deferred(t: &mut Ts, checker: &JsValue, ty: &JsValue, deep: bool, depth: usize) -> bool {
    let f = fl(t, ty, "flags");
    let mask = tf(t, "TypeParameter") | tf(t, "IndexedAccess") | tf(t, "Conditional") | tf(t, "Substitution") | tf(t, "Index");
    if f & mask != 0 {
        return true;
    }
    if depth > 6 {
        return false;
    }
    let mut parts: Vec<JsValue> = Vec::new();
    if is_union(t, ty) || is_inter(t, ty) {
        parts.extend(types_of(t, ty));
    }
    if f & tf(t, "TemplateLiteral") != 0 {
        parts.extend(types_of(t, ty));
    }
    if f & tf(t, "StringMapping") != 0 {
        let inner = t.get(ty, "type");
        if some(&inner) {
            parts.push(inner);
        }
    }
    if deep {
        let a = t.get(ty, "aliasTypeArguments");
        parts.extend(t.items(&a));
        if fl(t, ty, "objectFlags") & of_(t, "Reference") != 0 {
            let a = t.m(checker, "getTypeArguments", &[ty.clone()]);
            parts.extend(t.items(&a));
        }
    }
    parts.iter().any(|u| is_deferred(t, checker, u, deep, depth + 1))
}

/// `aliasValue(ts, type, declaration)`: the argument the mapped type's
/// alias gives the type parameter declared at `declaration`.
fn alias_value(t: &mut Ts, ty: &JsValue, declaration: &JsValue) -> Option<JsValue> {
    let alias_sym = t.get(ty, "aliasSymbol");
    let ds = t.get(&alias_sym, "declarations");
    let alias = t.items(&ds).into_iter().find(|d| t.is("isTypeAliasDeclaration", d))?;
    let tps = t.get(&alias, "typeParameters");
    let i = t.items(&tps).iter().position(|p| t.same(p, declaration))?;
    let args = t.get(ty, "aliasTypeArguments");
    let v = t.get_i(&args, i);
    if some(&v) {
        Some(v)
    } else {
        None
    }
}

/// `openWithoutValue(ts, checker, type, declaration)`.
fn open_without_value(t: &mut Ts, checker: &JsValue, ty: &JsValue, declaration: &JsValue) -> bool {
    let parent = t.get(declaration, "parent");
    if t.is("isTypeAliasDeclaration", &parent) {
        let props = t.m(checker, "getPropertiesOfType", &[ty.clone()]);
        let infos = t.m(checker, "getIndexInfosOfType", &[ty.clone()]);
        t.items(&props).is_empty() && t.items(&infos).is_empty()
    } else {
        true
    }
}

/// Is a type parameter, declared at `declaration`, open where the props are read?
fn parameter_open(t: &mut Ts, checker: &JsValue, ty: &JsValue, declaration: &JsValue) -> bool {
    match alias_value(t, ty, declaration) {
        Some(v) => is_deferred(t, checker, &v, true, 0),
        None => open_without_value(t, checker, ty, declaration),
    }
}

/// `constraintFromTypeParameter(ts, checker, type)`.
fn constraint_from_type_parameter(t: &mut Ts, checker: &JsValue, ty: &JsValue) -> bool {
    let decl = t.get(ty, "declaration");
    let tp = t.get(&decl, "typeParameter");
    let constraint = t.get(&tp, "constraint");
    if !some(&constraint) {
        return false;
    }
    fn visit(t: &mut Ts, checker: &JsValue, ty: &JsValue, node: &JsValue, open: &mut bool) {
        if *open {
            return;
        }
        let symbol = if t.is("isTypeReferenceNode", node) {
            let tn = t.get(node, "typeName");
            t.m(checker, "getSymbolAtLocation", &[tn])
        } else {
            JsValue::undefined()
        };
        let declaration = if some(&symbol) && fl(t, &symbol, "flags") & sf_(t, "TypeParameter") != 0 {
            decls(t, &symbol).first().cloned()
        } else {
            None
        };
        if let Some(d) = declaration {
            *open = parameter_open(t, checker, ty, &d);
            return;
        }
        for c in t.children(node) {
            visit(t, checker, ty, &c, open);
        }
    }
    let mut open = false;
    visit(t, checker, ty, &constraint, &mut open);
    open
}

fn renamed_by_type_parameter(t: &mut Ts, checker: &JsValue, ty: &JsValue) -> bool {
    let decl = t.get(ty, "declaration");
    let clause = t.get(&decl, "nameType");
    if !some(&clause) {
        return false;
    }
    fn uses(t: &mut Ts, checker: &JsValue, ty: &JsValue, decl: &JsValue, clause: &JsValue, node: &JsValue) -> bool {
        let symbol = if t.is("isTypeReferenceNode", node) {
            let tn = t.get(node, "typeName");
            t.m(checker, "getSymbolAtLocation", &[tn])
        } else {
            JsValue::undefined()
        };
        let declaration = if some(&symbol) && fl(t, &symbol, "flags") & sf_(t, "TypeParameter") != 0 {
            let d = decls(t, &symbol);
            d.first().cloned()
        } else {
            None
        };
        if let Some(d) = declaration {
            let dsf = t.m(&d, "getSourceFile", &[]);
            let csf = t.m(clause, "getSourceFile", &[]);
            let dp = t.get(&d, "pos");
            let cp = t.get(clause, "pos");
            let in_clause = t.same(&dsf, &csf) && t.n(&dp) >= t.n(&cp) && t.end(&d) <= t.end(clause);
            let own_param = t.get(decl, "typeParameter");
            if !t.same(&d, &own_param) && !in_clause && parameter_open(t, checker, ty, &d) {
                return true;
            }
        }
        for c in t.children(node) {
            if uses(t, checker, ty, decl, clause, &c) {
                return true;
            }
        }
        false
    }
    uses(t, checker, ty, &decl, &clause, &clause)
}

/// `namesFromTypeParameter(ts, checker, type, depth)`.
pub fn names_from_type_parameter(t: &mut Ts, checker: &JsValue, ty: &JsValue, depth: usize) -> bool {
    if depth > 8 {
        return false;
    }
    if is_union(t, ty) || is_inter(t, ty) {
        return types_of(t, ty).iter().any(|x| names_from_type_parameter(t, checker, x, depth + 1));
    }
    if is_deferred(t, checker, ty, false, 0) {
        return true;
    }
    let infos = t.m(checker, "getIndexInfosOfType", &[ty.clone()]);
    for info in t.items(&infos) {
        let it = t.get(&info, "type");
        let kt = t.get(&info, "keyType");
        if is_deferred(t, checker, &it, true, 0) || is_deferred(t, checker, &kt, true, 0) {
            return true;
        }
    }
    if fl(t, ty, "objectFlags") & of_(t, "Mapped") == 0 {
        return false;
    }
    t.m(checker, "getPropertiesOfType", &[ty.clone()]);
    constraint_from_type_parameter(t, checker, ty) || renamed_by_type_parameter(t, checker, ty)
}

fn key_accepts(t: &mut Ts, checker: &JsValue, key: &JsValue, name: &str) -> bool {
    let f = fl(t, key, "flags");
    if f & tf(t, "String") != 0 {
        return true;
    }
    if f & tf(t, "TemplateLiteral") == 0 {
        return false;
    }
    let _ = checker;
    // TypeScript 7 has no literal-type factory: match the template.
    let spans: Vec<String> = types_of(t, key)
        .iter()
        .map(|span| {
            if fl(t, span, "flags") & tf(t, "Number") != 0 {
                return r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?".to_string();
            }
            let sym = t.get(span, "symbol");
            let en = t.get(&sym, "escapedName");
            match t.s(&en).as_str() {
                "Uppercase" => "[^a-z]*".into(),
                "Lowercase" => "[^A-Z]*".into(),
                "Capitalize" => r"(?:[^a-z][\s\S]*)?".into(),
                "Uncapitalize" => r"(?:[^A-Z][\s\S]*)?".into(),
                _ => r"[\s\S]*".into(),
            }
        })
        .collect();
    let texts = t.get(key, "texts");
    let mut pattern = String::from("^");
    for (i, text) in t.items(&texts).iter().enumerate() {
        let text = t.s(text);
        for c in text.chars() {
            if ".*+?^${}()|[]\\".contains(c) {
                pattern.push('\\');
            }
            pattern.push(c);
        }
        if let Some(sp) = spans.get(i) {
            pattern.push_str(sp);
        }
    }
    pattern.push('$');
    regress::Regex::new(&pattern).map(|re| re.find(name).is_some()).unwrap_or(false)
}

/// `indexesFor(ts, checker, types, name)`: each signature's `info`.
pub fn indexes_for(t: &mut Ts, checker: &JsValue, types: &[JsValue], name: &str) -> Vec<JsValue> {
    let mut seen: Vec<String> = Vec::new();
    let mut out = Vec::new();
    for ty in types {
        let infos = t.m(checker, "getIndexInfosOfType", &[ty.clone()]);
        for info in t.items(&infos) {
            let kt = t.get(&info, "keyType");
            let it = t.get(&info, "type");
            let a = t.m(checker, "typeToString", &[kt.clone()]);
            let b = t.m(checker, "typeToString", &[it.clone()]);
            let key = format!("{}\0{}", t.s(&a), t.s(&b));
            if seen.contains(&key) {
                continue;
            }
            seen.push(key);
            if !holds_nothing(t, &it) && key_accepts(t, checker, &kt, name) {
                out.push(info);
            }
        }
    }
    out
}

fn holds_nothing(t: &mut Ts, ty: &JsValue) -> bool {
    let parts = if is_union(t, ty) { types_of(t, ty) } else { vec![ty.clone()] };
    let mask = tf(t, "Never") | tf(t, "Undefined");
    parts.iter().all(|p| fl(t, p, "flags") & mask != 0)
}

/// `holders(ts, checker, type)`.
pub fn holders(t: &mut Ts, checker: &JsValue, ty: &JsValue, depth: usize) -> Vec<JsValue> {
    if depth > 8 {
        return vec![ty.clone()];
    }
    if is_union(t, ty) {
        let mut out = Vec::new();
        for x in types_of(t, ty) {
            out.extend(holders(t, checker, &x, depth + 1));
        }
        return out;
    }
    let sym = t.get(ty, "symbol");
    let sname = t.get(&sym, "name");
    let sname = t.opt_s(&sname).unwrap_or_default();
    let target = t.get(ty, "target");
    let array = sname == "Array" || sname == "ReadonlyArray" || (some(&target) && fl(t, &target, "objectFlags") & of_(t, "Tuple") != 0);
    if array && fl(t, ty, "objectFlags") & of_(t, "Reference") != 0 {
        let args = t.m(checker, "getTypeArguments", &[ty.clone()]);
        let mut out = Vec::new();
        for x in t.items(&args) {
            out.extend(holders(t, checker, &x, depth + 1));
        }
        return out;
    }
    vec![ty.clone()]
}

pub fn takes_undefined(t: &mut Ts, ty: &JsValue) -> bool {
    let parts = if is_union(t, ty) { types_of(t, ty) } else { vec![ty.clone()] };
    let u = tf(t, "Undefined");
    parts.iter().any(|p| fl(t, p, "flags") & u != 0)
}

fn target_of(t: &mut Ts, checker: &JsValue, node: &JsValue) -> JsValue {
    let mut n = t.get(node, "typeName");
    if !some(&n) {
        n = t.get(node, "expression");
    }
    let used = t.m(checker, "getSymbolAtLocation", &[n]);
    aliased(t, checker, &used)
}

fn alias_of(t: &mut Ts, checker: &JsValue, node: &JsValue) -> Option<JsValue> {
    let target = target_of(t, checker, node);
    decls(t, &target).into_iter().find(|d| t.is("isTypeAliasDeclaration", d))
}

fn reads_keys(t: &mut Ts, checker: &JsValue, alias: Option<&JsValue>, i: usize, depth: usize) -> bool {
    let Some(alias) = alias else { return false };
    let tps = t.get(alias, "typeParameters");
    let p = t.get_i(&tps, i);
    if !some(&p) {
        return false;
    }
    let pn = t.get(&p, "name");
    let name = text_of(t, &pn);
    if name.is_empty() {
        return false;
    }
    fn visit(t: &mut Ts, checker: &JsValue, node: &JsValue, name: &str, depth: usize) -> bool {
        if t.is("isTypeOperatorNode", node) {
            let op = t.get(node, "operator");
            let ty = t.get(node, "type");
            let tn = t.get(&ty, "typeName");
            if t.n(&op) == sk(t, "KeyOfKeyword") && some(&tn) && text_of(t, &tn) == name {
                return true;
            }
        }
        if t.is("isTypeReferenceNode", node) && depth < 8 {
            let args = t.get(node, "typeArguments");
            let args = t.items(&args);
            for (j, a) in args.iter().enumerate() {
                let tn = t.get(a, "typeName");
                if some(&tn) && text_of(t, &tn) == name {
                    let al = alias_of(t, checker, node);
                    if reads_keys(t, checker, al.as_ref(), j, depth + 1) {
                        return true;
                    }
                }
            }
        }
        for c in t.children(node) {
            if visit(t, checker, &c, name, depth) {
                return true;
            }
        }
        false
    }
    visit(t, checker, alias, &name, depth)
}

fn shape_of(t: &mut Ts, symbol: &JsValue) -> Vec<JsValue> {
    let mut out = Vec::new();
    for d in decls(t, symbol) {
        if t.is("isTypeAliasDeclaration", &d) {
            out.push(t.get(&d, "type"));
        } else {
            let hc = t.get(&d, "heritageClauses");
            for c in t.items(&hc) {
                let tys = t.get(&c, "types");
                out.extend(t.items(&tys));
            }
        }
    }
    out
}

fn any_keyed(t: &mut Ts, checker: &JsValue, node: &JsValue, depth: usize) -> bool {
    if !some(node) || depth > 8 {
        return false;
    }
    if t.kind(node) == sk(t, "AnyKeyword") {
        return true;
    }
    if t.is("isParenthesizedTypeNode", node) {
        let ty = t.get(node, "type");
        return any_keyed(t, checker, &ty, depth + 1);
    }
    if t.is("isUnionTypeNode", node) || t.is("isIntersectionTypeNode", node) {
        let tys = t.get(node, "types");
        return t.items(&tys).iter().any(|x| any_keyed(t, checker, x, depth + 1));
    }
    if !some(&t.get(node, "typeName")) && !some(&t.get(node, "expression")) {
        return false;
    }
    let alias = alias_of(t, checker, node);
    let args = t.get(node, "typeArguments");
    if some(&args) {
        let args = t.items(&args);
        args.iter().enumerate().any(|(i, a)| any_keyed(t, checker, a, depth + 1) && reads_keys(t, checker, alias.as_ref(), i, 0))
    } else {
        let target = target_of(t, checker, node);
        shape_of(t, &target).iter().any(|n| any_keyed(t, checker, n, depth + 1))
    }
}

/// `isAnyProps(ts, checker, type, depth)`.
pub fn is_any_props(t: &mut Ts, checker: &JsValue, ty: &JsValue, depth: usize) -> bool {
    if fl(t, ty, "flags") & tf(t, "Any") != 0 {
        return !is_error_type(t, ty);
    }
    let parts = if is_union(t, ty) || is_inter(t, ty) { types_of(t, ty) } else { vec![ty.clone()] };
    parts.iter().any(|part| {
        let ata = t.get(part, "aliasTypeArguments");
        let alias_sym = t.get(part, "aliasSymbol");
        let alias_decl = decls(t, &alias_sym).first().cloned();
        let by_args = t.items(&ata).iter().enumerate().any(|(i, a)| {
            let ok = if fl(t, a, "flags") & tf(t, "Any") != 0 { !is_error_type(t, a) } else { depth < 4 && is_any_props(t, checker, a, depth + 1) };
            ok && reads_keys(t, checker, alias_decl.as_ref(), i, 0)
        });
        let by_shape = by_args || {
            let s = if some(&alias_sym) { alias_sym.clone() } else { t.get(part, "symbol") };
            shape_of(t, &s).iter().any(|n| any_keyed(t, checker, n, 0))
        };
        by_shape && {
            let infos = t.m(checker, "getIndexInfosOfType", &[part.clone()]);
            let any = tf(t, "Any");
            t.items(&infos).iter().any(|info| {
                let it = t.get(info, "type");
                fl(t, &it, "flags") & any != 0
            })
        }
    })
}

/// `hasUnresolvedPart(ts, checker, type, depth, seen)`.
pub fn has_unresolved_part(t: &mut Ts, checker: &JsValue, ty: &JsValue, depth: usize, seen: &mut Vec<JsValue>) -> bool {
    if depth > 24 || seen.iter().any(|s| t.same(s, ty)) {
        return false;
    }
    seen.push(ty.clone());
    if fl(t, ty, "flags") & tf(t, "Any") != 0 {
        return true;
    }
    let mut made: Vec<JsValue> = Vec::new();
    let ata = t.get(ty, "aliasTypeArguments");
    made.extend(t.items(&ata));
    let obj = fl(t, ty, "objectFlags");
    if obj & of_(t, "Reference") != 0 {
        let a = t.m(checker, "getTypeArguments", &[ty.clone()]);
        made.extend(t.items(&a));
    }
    if made.iter().any(|m| is_error_type(t, m)) {
        return true;
    }
    let mapped = obj & of_(t, "Mapped") != 0;
    if mapped {
        let props = t.m(checker, "getPropertiesOfType", &[ty.clone()]);
        for p in t.items(&props) {
            let pt = t.m(checker, "getTypeOfSymbol", &[p]);
            if is_error_type(t, &pt) {
                return true;
            }
        }
    }
    let decl = t.get(ty, "declaration");
    let tp = t.get(&decl, "typeParameter");
    let constraint = t.get(&tp, "constraint");
    let over = if some(&constraint) && t.is("isTypeOperatorNode", &constraint) { t.get(&constraint, "type") } else { constraint };
    if mapped && some(&over) {
        let ot = t.m(checker, "getTypeFromTypeNode", &[over]);
        if is_error_type(t, &ot) {
            return true;
        }
    }
    if fl(t, ty, "flags") & tf(t, "Object") != 0 {
        let infos = t.m(checker, "getIndexInfosOfType", &[ty.clone()]);
        for info in t.items(&infos) {
            let it = t.get(&info, "type");
            if !some(&t.get(&info, "declaration")) && is_error_type(t, &it) {
                return true;
            }
        }
    }
    if is_union(t, ty) || is_inter(t, ty) {
        return types_of(t, ty).iter().any(|x| has_unresolved_part(t, checker, x, depth + 1, seen));
    }
    if fl(t, ty, "flags") & tf(t, "Object") != 0 {
        let target = if obj & of_(t, "Reference") != 0 { t.get(ty, "target") } else { ty.clone() };
        if fl(t, &target, "objectFlags") & of_(t, "ClassOrInterface") != 0 {
            let sym = t.get(&target, "symbol");
            for d in decls(t, &sym) {
                let hc = t.get(&d, "heritageClauses");
                for c in t.items(&hc) {
                    let tys = t.get(&c, "types");
                    for n in t.items(&tys) {
                        let base = t.m(checker, "getTypeAtLocation", &[n]);
                        if has_unresolved_part(t, checker, &base, depth + 1, seen) {
                            return true;
                        }
                    }
                }
            }
        }
    }
    false
}
