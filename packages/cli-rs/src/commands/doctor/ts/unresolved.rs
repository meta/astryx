//! Port of `foundation/discovery/unresolved-references.mjs`: the first
//! reference a component's files make that the compiler cannot resolve, or a
//! type it can only give its error type.

use super::Ts;
use crate::discovery::nodepath as np;
use boa_engine::JsValue;

#[derive(Clone, Debug)]
pub struct Unresolved {
    pub name: String,
    pub file: String,
    /// `imported` | `named` | `used`.
    pub how: &'static str,
}

const TYPED_JSDOC_TAGS: &[&str] = &[
    "JSDocTypeTag",
    "JSDocParameterTag",
    "JSDocReturnTag",
    "JSDocTypedefTag",
    "JSDocCallbackTag",
    "JSDocTemplateTag",
    "JSDocPropertyTag",
    "JSDocThisTag",
    "JSDocEnumTag",
    "JSDocAugmentsTag",
    "JSDocImplementsTag",
    "JSDocSatisfiesTag",
    "JSDocOverloadTag",
    "JSDocImportTag",
];

fn some(v: &JsValue) -> bool {
    !v.is_undefined() && !v.is_null()
}

fn text(t: &mut Ts, n: &JsValue) -> String {
    let v = t.get(n, "text");
    t.s(&v)
}

fn file_name(t: &mut Ts, sf: &JsValue) -> String {
    let v = t.get(sf, "fileName");
    t.s(&v)
}

fn source_file(t: &mut Ts, n: &JsValue) -> JsValue {
    t.m(n, "getSourceFile", &[])
}

fn flags(t: &mut Ts, v: &JsValue) -> u64 {
    let f = t.get(v, "flags");
    t.n(&f) as i64 as u64
}

fn sym_flag(t: &mut Ts, n: &str) -> u64 {
    t.enum_value("SymbolFlags", n) as i64 as u64
}

struct Ctx<'a> {
    program: JsValue,
    checker: JsValue,
    options: JsValue,
    sys: JsValue,
    side_effects: bool,
    mine: &'a dyn Fn(&str) -> bool,
    typed_tags: Vec<f64>,
    starts: Vec<f64>,
    errors: Vec<(JsValue, Vec<f64>)>,
    untyped_names: Vec<(JsValue, Vec<String>)>,
}

fn resolves(t: &mut Ts, c: &Ctx, spec: &str, from: &str) -> bool {
    let (s, f) = (t.str(spec), t.str(from));
    let r = t.f("resolveModuleName", &[s, f, c.options.clone(), c.sys.clone()]);
    some(&t.get(&r, "resolvedModule"))
}

fn bound_names(t: &mut Ts, parent: &JsValue) -> Vec<String> {
    if t.is("isExternalModuleReference", parent) {
        let pp = t.get(parent, "parent");
        let n = t.get(&pp, "name");
        return vec![text(t, &n)];
    }
    let clause = if t.is("isImportDeclaration", parent) { t.get(parent, "importClause") } else { JsValue::undefined() };
    let bound = if some(&clause) { t.get(&clause, "namedBindings") } else { JsValue::undefined() };
    let mut out = Vec::new();
    if some(&clause) {
        let n = t.get(&clause, "name");
        if some(&n) {
            out.push(text(t, &n));
        }
    }
    if some(&bound) && t.is("isNamespaceImport", &bound) {
        let n = t.get(&bound, "name");
        out.push(text(t, &n));
    }
    if some(&bound) && t.is("isNamedImports", &bound) {
        let els = t.get(&bound, "elements");
        for e in t.items(&els) {
            let n = t.get(&e, "name");
            out.push(text(t, &n));
        }
    }
    out
}

fn untyped_names_of(t: &mut Ts, c: &mut Ctx, file: &JsValue) -> Vec<String> {
    if let Some((_, n)) = c.untyped_names.iter().find(|(f, _)| t.same(f, file)) {
        return n.clone();
    }
    let mut names = Vec::new();
    let imports = t.get(file, "imports");
    let fname = file_name(t, file);
    for lit in t.items(&imports) {
        let pos = t.get(&lit, "pos");
        if t.n(&pos) < 0.0 || some(&t.m(&c.checker, "getSymbolAtLocation", &[lit.clone()])) {
            continue;
        }
        let tx = text(t, &lit);
        if resolves(t, c, &tx, &fname) {
            let parent = t.get(&lit, "parent");
            for n in bound_names(t, &parent) {
                if !names.contains(&n) {
                    names.push(n);
                }
            }
        }
    }
    c.untyped_names.push((file.clone(), names.clone()));
    names
}

fn error_reported(t: &mut Ts, c: &mut Ctx, file: &JsValue, node: &JsValue) -> bool {
    let starts = match c.errors.iter().find(|(f, _)| t.same(f, file)) {
        Some((_, s)) => s.clone(),
        None => {
            let err = t.enum_value("DiagnosticCategory", "Error");
            let ds = t.m(&c.program, "getSemanticDiagnostics", &[file.clone()]);
            let mut s = Vec::new();
            for d in t.items(&ds) {
                let cat = t.get(&d, "category");
                if t.n(&cat) != err {
                    continue;
                }
                let st = t.get(&d, "start");
                s.push(if st.is_undefined() { f64::NAN } else { t.n(&st) });
            }
            c.errors.push((file.clone(), s.clone()));
            s
        }
    };
    let start = t.start(node, file);
    let end = t.end(node);
    starts.iter().any(|s| !s.is_nan() && *s >= start && *s < end)
}

fn overloaded(t: &mut Ts, c: &Ctx, f: &JsValue) -> bool {
    let name = t.get(f, "name");
    if !some(&name) {
        return false;
    }
    let sym = t.m(&c.checker, "getSymbolAtLocation", &[name]);
    let decls = t.get(&sym, "declarations");
    t.items(&decls).iter().any(|d| !t.same(d, f) && t.is("isFunctionLike", d) && !some(&t.get(d, "body")))
}

fn type_sources(t: &mut Ts, c: &Ctx, declaration: &JsValue) -> Vec<JsValue> {
    let mut sources = Vec::new();
    if t.is("isFunctionLike", declaration) {
        if overloaded(t, c, declaration) {
            return sources;
        }
        let ps = t.get(declaration, "parameters");
        for p in t.items(&ps) {
            let init = t.get(&p, "initializer");
            if !some(&t.get(&p, "type")) && some(&init) {
                sources.push(init);
            }
        }
        let body = t.get(declaration, "body");
        if some(&t.get(declaration, "type")) || !some(&body) {
            return sources;
        }
        if !t.is("isBlock", &body) {
            sources.push(body);
            return sources;
        }
        fn visit(t: &mut Ts, n: &JsValue, out: &mut Vec<JsValue>) {
            if t.is("isFunctionLike", n) || t.is("isClassLike", n) {
                return;
            }
            if t.is("isReturnStatement", n) {
                let e = t.get(n, "expression");
                if some(&e) {
                    out.push(e);
                }
            }
            for ch in t.children(n) {
                visit(t, &ch, out);
            }
        }
        for ch in t.children(&body) {
            visit(t, &ch, &mut sources);
        }
    } else if t.is("isClassLike", declaration) {
        let ext = t.enum_value("SyntaxKind", "ExtendsKeyword");
        let hc = t.get(declaration, "heritageClauses");
        for cl in t.items(&hc) {
            let tok = t.get(&cl, "token");
            if t.n(&tok) == ext {
                let tys = t.get(&cl, "types");
                for b in t.items(&tys) {
                    sources.push(t.get(&b, "expression"));
                }
            }
        }
    } else if t.is("isBindingElement", declaration) {
        let init = t.get(declaration, "initializer");
        if some(&init) {
            sources.push(init);
        }
        let mut root = t.get(declaration, "parent");
        while some(&root) && !t.is("isVariableDeclaration", &root) && !t.is("isParameter", &root) {
            root = t.get(&root, "parent");
        }
        if some(&root) && !some(&t.get(&root, "type")) {
            let i = t.get(&root, "initializer");
            if some(&i) {
                sources.push(i);
            }
        }
    } else if !some(&t.get(declaration, "type")) {
        let i = t.get(declaration, "initializer");
        if some(&i) {
            sources.push(i);
        }
    }
    sources
}

fn reads_value(t: &mut Ts, node: &JsValue) -> bool {
    if t.is("isPropertyAccessExpression", node) || t.is("isElementAccessExpression", node) || t.is("isCallExpression", node) {
        return true;
    }
    if !t.is("isIdentifier", node) {
        return false;
    }
    let p = t.get(node, "parent");
    if t.is("isSpreadAssignment", &p) || t.is("isSpreadElement", &p) || t.is("isJsxSpreadAttribute", &p) || t.is("isShorthandPropertyAssignment", &p) {
        return true;
    }
    if t.is("isVariableDeclaration", &p) || t.is("isPropertyAssignment", &p) {
        let i = t.get(&p, "initializer");
        if t.same(&i, node) {
            return true;
        }
    }
    if t.is("isCallExpression", &p) {
        let args = t.get(&p, "arguments");
        if t.items(&args).iter().any(|a| t.same(a, node)) {
            return true;
        }
    }
    ["isReturnStatement", "isArrayLiteralExpression", "isParenthesizedExpression", "isAsExpression", "isConditionalExpression", "isJsxExpression", "isExportAssignment"]
        .iter()
        .any(|f| t.is(f, &p))
}

fn root_name(t: &mut Ts, node: &JsValue) -> String {
    let mut root = node.clone();
    while t.is("isPropertyAccessExpression", &root) || t.is("isElementAccessExpression", &root) || t.is("isCallExpression", &root) {
        root = t.get(&root, "expression");
    }
    if t.is("isIdentifier", &root) {
        text(t, &root)
    } else {
        String::new()
    }
}

fn is_error_value(t: &mut Ts, c: &Ctx, node: &JsValue) -> bool {
    match t.call(&c.checker, "getTypeAtLocation", &[node.clone()]) {
        Ok(ty) => {
            let n = t.get(&ty, "intrinsicName");
            t.opt_s(&n).as_deref() == Some("error")
        }
        Err(_) => false,
    }
}

fn is_error_type(t: &mut Ts, c: &Ctx, node: &JsValue) -> bool {
    match t.call(&c.checker, "getTypeFromTypeNode", &[node.clone()]) {
        Ok(ty) => {
            let n = t.get(&ty, "intrinsicName");
            t.opt_s(&n).as_deref() == Some("error")
        }
        Err(_) => false,
    }
}

fn aliased(t: &mut Ts, c: &Ctx, s: JsValue) -> JsValue {
    if some(&s) && flags(t, &s) & sym_flag(t, "Alias") != 0 {
        t.m(&c.checker, "getAliasedSymbol", &[s])
    } else {
        s
    }
}

/// `localScan(declaration)`: (found node and file, declarations it names).
fn local_scan(t: &mut Ts, c: &mut Ctx, declaration: &JsValue) -> (Option<(JsValue, JsValue)>, Vec<JsValue>) {
    let file = source_file(t, declaration);
    let untyped_here = untyped_names_of(t, c, &file);
    let mut names: Vec<JsValue> = Vec::new();
    let mut found: Option<(JsValue, JsValue)> = None;
    fn scan(t: &mut Ts, c: &mut Ctx, node: &JsValue, file: &JsValue, untyped_here: &[String], names: &mut Vec<JsValue>, found: &mut Option<(JsValue, JsValue)>) {
        if found.is_some() {
            return;
        }
        if t.is("isJsxElement", node) || t.is("isJsxSelfClosingElement", node) || t.is("isJsxFragment", node) {
            return;
        }
        if t.is("isAsExpression", node) || t.is("isTypeAssertionExpression", node) {
            let ty = t.get(node, "type");
            if !t.is("isConstTypeReference", &ty) {
                return;
            }
        }
        if t.is("isFunctionLike", node) || t.is("isClassLike", node) {
            for s in type_sources(t, c, node) {
                scan(t, c, &s, file, untyped_here, names, found);
            }
            return;
        }
        for ch in t.children(node) {
            scan(t, c, &ch, file, untyped_here, names, found);
        }
        if found.is_some() {
            return;
        }
        if reads_value(t, node) && !untyped_here.contains(&root_name(t, node)) && is_error_value(t, c, node) && error_reported(t, c, file, node) {
            *found = Some((node.clone(), file.clone()));
            return;
        }
        if !t.is("isIdentifier", node) {
            return;
        }
        let parent = t.get(node, "parent");
        let pname = t.get(&parent, "name");
        let sym = if t.is("isShorthandPropertyAssignment", &parent) && t.same(&pname, node) {
            t.m(&c.checker, "getShorthandAssignmentValueSymbol", &[parent])
        } else {
            t.m(&c.checker, "getSymbolAtLocation", &[node.clone()])
        };
        let sym = aliased(t, c, sym);
        let decls = t.get(&sym, "declarations");
        for d in t.items(&decls) {
            if !names.iter().any(|n| t.same(n, &d)) {
                names.push(d);
            }
        }
    }
    for s in type_sources(t, c, declaration) {
        scan(t, c, &s, &file, &untyped_here, &mut names, &mut found);
        if found.is_some() {
            break;
        }
    }
    (found, names)
}

fn scan_declarations(t: &mut Ts, c: &mut Ctx, declarations: &[JsValue]) -> Option<(JsValue, JsValue)> {
    let mut visited: Vec<JsValue> = Vec::new();
    fn walk(t: &mut Ts, c: &mut Ctx, list: &[JsValue], visited: &mut Vec<JsValue>) -> Option<(JsValue, JsValue)> {
        for d in list {
            let file = source_file(t, d);
            let fname = file_name(t, &file);
            if visited.iter().any(|v| t.same(v, d))
                || t.get(&file, "isDeclarationFile").to_boolean()
                || crate::doctor_re!(r"\.[cm]?tsx?$").find(&fname).is_none()
                || !(c.mine)(&fname)
            {
                continue;
            }
            visited.push(d.clone());
            let (found, names) = local_scan(t, c, d);
            let reached = found.or_else(|| walk(t, c, &names, visited));
            if reached.is_some() {
                return reached;
            }
        }
        None
    }
    walk(t, c, declarations, &mut visited)
}

fn one_line(text: &str) -> String {
    use crate::commands::doctor::util::JsRe;
    let a = crate::doctor_re!(r"/\*[\s\S]*?\*/|//[^\n]*", "g").replace_all(text, "");
    let b = crate::doctor_re!(r"\s+", "g").replace_all(&a, " ");
    b.trim_matches(crate::discovery::paths::js_ws).to_string()
}

fn is_value_with_type_arguments(t: &mut Ts, node: &JsValue) -> bool {
    if !t.is("isExpressionWithTypeArguments", node) {
        return false;
    }
    let clause = t.get(node, "parent");
    if !t.is("isHeritageClause", &clause) {
        return true;
    }
    let tok = t.get(&clause, "token");
    let ext = t.enum_value("SyntaxKind", "ExtendsKeyword");
    let cp = t.get(&clause, "parent");
    t.n(&tok) == ext && (t.is("isClassDeclaration", &cp) || t.is("isClassExpression", &cp))
}

struct FileRead {
    missing: Option<Unresolved>,
    untyped: Option<Unresolved>,
    next: Vec<JsValue>,
}

fn read(t: &mut Ts, c: &mut Ctx, sf: &JsValue) -> FileRead {
    let fname = file_name(t, sf);
    let mut missing: Option<Unresolved> = None;
    let mut next: Vec<JsValue> = Vec::new();
    let mut untyped_names: Vec<String> = Vec::new();
    let imports = t.get(sf, "imports");
    for lit in t.items(&imports) {
        let parent = t.get(&lit, "parent");
        let pos = t.get(&lit, "pos");
        if !some(&parent) || missing.is_some() || t.n(&pos) < 0.0 {
            continue;
        }
        if t.is("isImportDeclaration", &parent) && !some(&t.get(&parent, "importClause")) && !c.side_effects {
            continue;
        }
        let module = t.m(&c.checker, "getSymbolAtLocation", &[lit.clone()]);
        let lt = text(t, &lit);
        if !some(&module) {
            if !resolves(t, c, &lt, &fname) {
                missing.get_or_insert(Unresolved { name: format!("`{lt}`"), file: fname.clone(), how: "imported" });
            } else {
                for n in bound_names(t, &parent) {
                    if !untyped_names.contains(&n) {
                        untyped_names.push(n);
                    }
                }
            }
            continue;
        }
        let md = t.get(&module, "declarations");
        for d in t.items(&md) {
            next.push(source_file(t, &d));
        }
        let clause = if t.is("isImportDeclaration", &parent) { t.get(&parent, "importClause") } else { JsValue::undefined() };
        let bound = if some(&clause) { t.get(&clause, "namedBindings") } else { JsValue::undefined() };
        let exported = if t.is("isExportDeclaration", &parent) { t.get(&parent, "exportClause") } else { JsValue::undefined() };
        let mut names: Vec<JsValue> = Vec::new();
        if some(&clause) {
            let n = t.get(&clause, "name");
            if some(&n) {
                names.push(n);
            }
        }
        if some(&bound) && t.is("isNamedImports", &bound) {
            let els = t.get(&bound, "elements");
            names.extend(t.items(&els));
        }
        if some(&exported) && t.is("isNamedExports", &exported) {
            let els = t.get(&exported, "elements");
            names.extend(t.items(&els));
        }
        for n in names {
            let nm = t.get(&n, "name");
            let name = if some(&nm) { nm } else { n };
            let alias = t.m(&c.checker, "getSymbolAtLocation", &[name.clone()]);
            let resolved = if some(&alias) { t.m(&c.checker, "getAliasedSymbol", &[alias]) } else { JsValue::undefined() };
            let unknown = some(&resolved) && {
                let en = t.get(&resolved, "escapedName");
                let decls = t.get(&resolved, "declarations");
                t.opt_s(&en).as_deref() == Some("unknown") && t.items(&decls).is_empty()
            };
            if !some(&resolved) || unknown {
                let nt = text(t, &name);
                missing.get_or_insert(Unresolved { name: format!("`{nt}` from `{lt}`"), file: fname.clone(), how: "imported" });
            }
        }
    }
    let trd = t.get(sf, "typeReferenceDirectives");
    for r in t.items(&trd) {
        let rf = t.get(&r, "fileName");
        let rfs = t.s(&rf);
        let (a, b) = (t.str(&rfs), t.str(&fname));
        let res = t.f("resolveTypeReferenceDirective", &[a, b, c.options.clone(), c.sys.clone()]);
        let rtd = t.get(&res, "resolvedTypeReferenceDirective");
        let found = t.get(&rtd, "resolvedFileName");
        match t.opt_s(&found) {
            None => {
                missing.get_or_insert(Unresolved { name: format!("the types `{rfs}`"), file: fname.clone(), how: "imported" });
            }
            Some(f) => {
                let fj = t.str(&f);
                let s = t.m(&c.program, "getSourceFile", &[fj]);
                if some(&s) {
                    next.push(s);
                }
            }
        }
    }
    let rfs = t.get(sf, "referencedFiles");
    for r in t.items(&rfs) {
        let rf = t.get(&r, "fileName");
        let rfs = t.s(&rf);
        let file = np::resolve(&[&np::dirname(&fname), &rfs]);
        let mut hit = None;
        for ext in ["", ".ts", ".tsx", ".d.ts"] {
            let fj = t.str(&format!("{file}{ext}"));
            let s = t.m(&c.program, "getSourceFile", &[fj]);
            if some(&s) {
                hit = Some(s);
                break;
            }
        }
        match hit {
            Some(s) => next.push(s),
            None => {
                missing.get_or_insert(Unresolved { name: format!("`{rfs}`"), file: fname.clone(), how: "imported" });
            }
        }
    }
    let mut untyped: Option<Unresolved> = None;
    if missing.is_none() && (c.mine)(&fname) {
        let js = crate::doctor_re!(r"\.[cm]?jsx?$").find(&fname).is_some();
        visit_untyped(t, c, sf, sf, &fname, js, &untyped_names, &mut untyped);
    }
    FileRead { missing, untyped, next }
}

#[allow(clippy::too_many_arguments)]
fn visit_untyped(t: &mut Ts, c: &mut Ctx, node: &JsValue, sf: &JsValue, fname: &str, js: bool, untyped_names: &[String], untyped: &mut Option<Unresolved>) {
    if untyped.is_some() {
        return;
    }
    if js {
        let docs = t.get(node, "jsDoc");
        for d in t.items(&docs) {
            let tags = t.get(&d, "tags");
            for tag in t.items(&tags) {
                if c.typed_tags.contains(&t.kind(&tag)) {
                    visit_untyped(t, c, &tag, sf, fname, js, untyped_names, untyped);
                }
            }
        }
    }
    for ch in t.children(node) {
        visit_untyped(t, c, &ch, sf, fname, js, untyped_names, untyped);
    }
    if untyped.is_some() {
        return;
    }
    // baseless
    if is_value_with_type_arguments(t, node) {
        let p = t.get(node, "parent");
        let e = t.get(node, "expression");
        if (t.is("isHeritageClause", &p) || t.is("isJSDocAugmentsTag", &p)) && t.is("isEntityNameExpression", &e) && !some(&t.m(&c.checker, "getSymbolAtLocation", &[e.clone()])) {
            let tx = t.m(&e, "getText", &[sf.clone()]);
            *untyped = Some(Unresolved { name: format!("`{}`", t.s(&tx)), file: fname.into(), how: "used" });
            return;
        }
    }
    let kind = t.kind(node);
    let mut hit = false;
    if c.starts.contains(&kind) && !(t.is("isTypeReferenceNode", node) && t.is("isConstTypeReference", node)) && !is_value_with_type_arguments(t, node) && !from_untyped(t, c, node, fname, untyped_names) && is_error_type(t, c, node) {
        hit = true;
    }
    if !hit && t.is("isTypeQueryNode", node) {
        let en = t.get(node, "exprName");
        reads_error_value(t, c, &en, false, untyped);
    }
    if !hit && t.is("isIndexedAccessTypeNode", node) {
        reads_indexed_members(t, c, node, untyped);
    }
    if !hit && t.is("isTypeReferenceNode", node) {
        let tn = t.get(node, "typeName");
        reads_error_value(t, c, &tn, true, untyped);
    }
    if !hit && t.is("isExpressionWithTypeArguments", node) {
        let e = t.get(node, "expression");
        reads_error_value(t, c, &e, true, untyped);
    }
    if hit && untyped.is_none() {
        let tx = t.m(node, "getText", &[sf.clone()]);
        *untyped = Some(Unresolved { name: format!("`{}`", t.s(&tx)), file: fname.into(), how: "used" });
    }
}

fn from_untyped(t: &mut Ts, c: &Ctx, node: &JsValue, fname: &str, untyped_names: &[String]) -> bool {
    if t.is("isImportTypeNode", node) {
        let arg = t.get(node, "argument");
        let lit = t.get(&arg, "literal");
        if !some(&lit) || !t.is("isStringLiteral", &lit) || some(&t.m(&c.checker, "getSymbolAtLocation", &[lit.clone()])) {
            return false;
        }
        let lt = text(t, &lit);
        return resolves(t, c, &lt, fname);
    }
    let mut name = if t.is("isTypeQueryNode", node) {
        t.get(node, "exprName")
    } else if t.is("isTypeReferenceNode", node) {
        t.get(node, "typeName")
    } else {
        JsValue::undefined()
    };
    while some(&name) && t.is("isQualifiedName", &name) {
        name = t.get(&name, "left");
    }
    some(&name) && t.is("isIdentifier", &name) && untyped_names.contains(&text(t, &name))
}

fn reads_error_value(t: &mut Ts, c: &mut Ctx, name: &JsValue, classes: bool, untyped: &mut Option<Unresolved>) {
    let target = t.m(&c.checker, "getSymbolAtLocation", &[name.clone()]);
    let target = aliased(t, c, target);
    let decls = t.get(&target, "declarations");
    let decls: Vec<JsValue> = t.items(&decls).into_iter().filter(|d| !classes || t.is("isClassLike", d)).collect();
    if let Some((node, file)) = scan_declarations(t, c, &decls) {
        let tx = t.m(&node, "getText", &[file.clone()]);
        let fname = file_name(t, &file);
        *untyped = Some(Unresolved { name: format!("`{}`", one_line(&t.s(&tx))), file: fname, how: "used" });
    }
}

fn reads_indexed_members(t: &mut Ts, c: &mut Ctx, node: &JsValue, untyped: &mut Option<Unresolved>) {
    let ot = t.get(node, "objectType");
    let it = t.get(node, "indexType");
    let object = t.m(&c.checker, "getTypeFromTypeNode", &[ot]);
    let index = t.m(&c.checker, "getTypeFromTypeNode", &[it]);
    let keys: Vec<JsValue> = super::type_match::union_members(t, &index)
        .into_iter()
        .filter(|k| t.m(k, "isStringLiteral", &[]).to_boolean() || t.m(k, "isNumberLiteral", &[]).to_boolean())
        .collect();
    let mut decls = Vec::new();
    for k in keys {
        let v = t.get(&k, "value");
        let vss = t.s(&v);
        let vs = t.str(&vss);
        let member = t.m(&c.checker, "getPropertyOfType", &[object.clone(), vs]);
        let ds = t.get(&member, "declarations");
        decls.extend(t.items(&ds));
    }
    if let Some((node, file)) = scan_declarations(t, c, &decls) {
        let tx = t.m(&node, "getText", &[file.clone()]);
        let fname = file_name(t, &file);
        *untyped = Some(Unresolved { name: format!("`{}`", one_line(&t.s(&tx))), file: fname, how: "used" });
    }
}

/// `unresolvedReference(ts, program, checker, roots, follow, mine)`.
pub fn unresolved_reference(t: &mut Ts, program: &JsValue, checker: &JsValue, roots: &[JsValue], follow: &dyn Fn(&str) -> bool, mine: &dyn Fn(&str) -> bool) -> Option<Unresolved> {
    let ts: JsValue = t.ts.clone().into();
    let k = t.get(&ts, "SyntaxKind");
    let typed_tags: Vec<f64> = TYPED_JSDOC_TAGS.iter().filter_map(|n| t.get(&k, n).as_number()).collect();
    let starts: Vec<f64> = ["TypeReference", "TypeQuery", "IndexedAccessType", "ImportType", "ExpressionWithTypeArguments"].iter().map(|n| t.enum_value("SyntaxKind", n)).collect();
    let options = t.m(program, "getCompilerOptions", &[]);
    let use_ = t.get(&options, "noUncheckedSideEffectImports");
    let side_effects = if some(&use_) {
        use_.to_boolean()
    } else {
        let mm = t.get(&ts, "versionMajorMinor");
        t.s(&mm).split('.').next().and_then(|x| x.parse::<i64>().ok()).unwrap_or(0) >= 6
    };
    let sys = t.get(&ts, "sys");
    let mut c = Ctx { program: program.clone(), checker: checker.clone(), options, sys, side_effects, mine, typed_tags, starts, errors: vec![], untyped_names: vec![] };
    let mut first_untyped: Option<Unresolved> = None;
    let mut seen: Vec<JsValue> = Vec::new();
    let mut queue: std::collections::VecDeque<JsValue> = roots.iter().filter(|r| some(r)).cloned().collect();
    while let Some(sf) = queue.pop_front() {
        if seen.iter().any(|s| t.same(s, &sf)) {
            continue;
        }
        seen.push(sf.clone());
        let r = read(t, &mut c, &sf);
        if r.missing.is_some() {
            return r.missing;
        }
        if first_untyped.is_none() {
            first_untyped = r.untyped;
        }
        for f in r.next {
            let fname = file_name(t, &f);
            if follow(&fname) {
                queue.push_back(f);
            }
        }
    }
    first_untyped
}

fn imports_names(t: &mut Ts, statement: &JsValue) -> bool {
    let clause = t.get(statement, "importClause");
    if !some(&clause) {
        return false;
    }
    let bound = t.get(&clause, "namedBindings");
    some(&t.get(&clause, "name")) || (some(&bound) && (!t.is("isNamedImports", &bound) || {
        let els = t.get(&bound, "elements");
        !t.items(&els).is_empty()
    }))
}

/// `unresolvedGlobals(ts, program, checker, declarations, options, isOwnFile)`.
pub fn unresolved_globals(t: &mut Ts, program: &JsValue, checker: &JsValue, declarations: &[String], options: &JsValue, is_own_file: &dyn Fn(&str) -> bool) -> Option<Unresolved> {
    let ts: JsValue = t.ts.clone().into();
    let sys = t.get(&ts, "sys");
    let cfp = t.get(options, "configFilePath");
    let config = match t.opt_s(&cfp) {
        Some(s) => s,
        None => {
            let cwd = t.m(&sys, "getCurrentDirectory", &[]);
            np::join2(&t.s(&cwd), "tsconfig.json")
        }
    };
    let follow = |f: &str| is_own_file(f) || crate::doctor_re!(r"[\\/]node_modules[\\/]").find(f).is_none();
    let own = is_own_file(&config);
    let global = |t: &mut Ts, sf: &JsValue| -> bool {
        if !some(sf) {
            return false;
        }
        if !t.f("isExternalModule", std::slice::from_ref(sf)).to_boolean() {
            return true;
        }
        let rf = t.get(sf, "referencedFiles");
        let td = t.get(sf, "typeReferenceDirectives");
        if !t.items(&rf).is_empty() || !t.items(&td).is_empty() {
            return true;
        }
        let stmts = t.get(sf, "statements");
        t.items(&stmts).iter().any(|s| {
            (t.is("isModuleDeclaration", s) && (t.f("isGlobalScopeAugmentation", std::slice::from_ref(s)).to_boolean() || {
                let n = t.get(s, "name");
                t.is("isStringLiteral", &n)
            })) || t.is("isNamespaceExportDeclaration", s)
                || (t.is("isImportDeclaration", s) && !imports_names(t, s))
                || (t.is("isExportDeclaration", s) && some(&t.get(s, "moduleSpecifier")) && !some(&t.get(s, "exportClause")))
        })
    };
    let mut roots: Vec<JsValue> = Vec::new();
    for f in declarations {
        if !(own || is_own_file(f)) {
            continue;
        }
        let fj = t.str(f);
        let sf = t.m(program, "getSourceFile", &[fj]);
        if global(t, &sf) {
            roots.push(sf);
        }
    }
    let names = t.f("getAutomaticTypeDirectiveNames", &[options.clone(), sys.clone()]);
    for name in t.items(&names) {
        let n = t.s(&name);
        let inferred = t.str(&np::join2(&np::dirname(&config), "__inferred type names__.ts"));
        let res = t.f("resolveTypeReferenceDirective", &[name.clone(), inferred, options.clone(), sys.clone()]);
        let rtd = t.get(&res, "resolvedTypeReferenceDirective");
        let found = t.get(&rtd, "resolvedFileName");
        let Some(found) = t.opt_s(&found) else {
            return Some(Unresolved { name: format!("the types `{n}`"), file: config, how: "named" });
        };
        if follow(&found) {
            let fj = t.str(&found);
            let sf = t.m(program, "getSourceFile", &[fj]);
            if global(t, &sf) {
                roots.push(sf);
            }
        }
    }
    unresolved_reference(t, program, checker, &roots, &follow, &follow)
}
