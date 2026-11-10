//! Port of `foundation/discovery/doc-types.mjs`: each doc value checked
//! against the published authoring type with the project's own TypeScript.

use super::Ts;
use crate::discovery::nodepath as np;
use crate::json::{Map, Value};
use boa_engine::JsValue;

pub const MISSING_REASON_TAIL: &str = "so docs were not checked against the authoring types.";
const AUTHORING: &str = "@astryxdesign/cli/authoring";
const TRANSLATIONS: &[&str] = &["docsZh", "docsDense"];
const MAX_PASSES: usize = 50;
const RELEVANT: &[f64] = &[1360.0, 2322.0, 2353.0, 2559.0, 2561.0, 2739.0, 2740.0, 2741.0, 2820.0];

fn main_exports(root: &str) -> &'static [&'static str] {
    match root {
        "components" | "hooks" => &["default", "docs"],
        "templates" => &["default", "doc"],
        "docs" => &["docs", "default"],
        "docs-overlay" => &[],
        "themes" => &["default", "doc", "docs"],
        "icon-sets" => &["default"],
        _ => &[],
    }
}

fn docs_root_type(stamp: &str) -> Option<&'static str> {
    Some(match stamp {
        "generic" => "ReferenceDoc",
        "namespace" => "NamespaceDoc",
        "function" => "FunctionDoc",
        "schema" => "SchemaDoc",
        "command" => "CommandDoc",
        "enum" => "EnumDoc",
        "theme" => "ThemeDoc",
        "component" => "ComponentDoc",
        "page" | "block" => "IntegrationTemplateDoc",
        _ => return None,
    })
}

fn authoring(name: &str) -> String {
    format!("import('{AUTHORING}').{name}")
}

struct Shape {
    names: Vec<String>,
    stamp: Option<String>,
    components_with_props: bool,
}

fn property_name(t: &mut Ts, name: &JsValue) -> Option<String> {
    if t.is("isIdentifier", name) || t.is("isStringLiteralLike", name) || t.is("isNumericLiteral", name) || t.is("isPrivateIdentifier", name) {
        let v = t.get(name, "text");
        return Some(t.s(&v));
    }
    None
}

fn shape_of(t: &mut Ts, node: &JsValue) -> Option<Shape> {
    if !t.is("isObjectLiteralExpression", node) {
        return None;
    }
    let mut sh = Shape { names: vec![], stamp: None, components_with_props: false };
    let props = t.get(node, "properties");
    for p in t.items(&props) {
        let name = t.get(&p, "name");
        let key = if name.is_undefined() { None } else { property_name(t, &name) };
        let Some(key) = key else { continue };
        if !sh.names.contains(&key) {
            sh.names.push(key.clone());
        }
        if key == "type" && t.is("isPropertyAssignment", &p) {
            let init = t.get(&p, "initializer");
            if t.is("isStringLiteralLike", &init) {
                let v = t.get(&init, "text");
                sh.stamp = Some(t.s(&v));
            }
        }
        if key == "components" && t.is("isPropertyAssignment", &p) {
            let init = t.get(&p, "initializer");
            if t.is("isArrayLiteralExpression", &init) {
                let els = t.get(&init, "elements");
                sh.components_with_props = t.items(&els).iter().any(|e| {
                    if !t.is("isObjectLiteralExpression", e) {
                        return false;
                    }
                    let ps = t.get(e, "properties");
                    t.items(&ps).iter().any(|pp| {
                        let n = t.get(pp, "name");
                        !n.is_undefined() && property_name(t, &n).as_deref() == Some("props")
                    })
                });
            }
        }
    }
    Some(sh)
}

fn component_type(shape: Option<&Shape>) -> (String, String) {
    let union = authoring("ComponentDoc");
    let has = |n: &str| shape.map(|s| s.names.iter().any(|x| x == n)).unwrap_or(false);
    let member = if has("subComponentOf") {
        Some(format!("Extract<{union}, {{subComponentOf: string}}>"))
    } else if shape.is_some() && has("components") && !has("props") {
        Some(authoring("MultiComponentDoc"))
    } else if shape.is_some() && !has("components") {
        Some(authoring("SingleComponentDoc"))
    } else {
        None
    };
    let Some(member) = member else { return (union, "ComponentDoc".into()) };
    let all_keys = format!("({union} extends infer U ? U extends unknown ? keyof U : never : never)");
    (format!("{member} & Partial<Record<Exclude<{all_keys}, keyof {member}>, unknown>>"), "ComponentDoc".into())
}

fn expected_type(t: &mut Ts, root: &str, export_name: &str, node: &JsValue, core: bool) -> (String, String) {
    let shape = shape_of(t, node);
    let has = |n: &str| shape.as_ref().map(|s| s.names.iter().any(|x| x == n)).unwrap_or(false);
    let translation = TRANSLATIONS.contains(&export_name);
    let named = |n: &str| (authoring(n), n.to_string());
    match root {
        "components" => {
            if translation && !(has("props") || shape.as_ref().map(|s| s.components_with_props).unwrap_or(false)) {
                return named("ComponentTranslationDoc");
            }
            if translation {
                let (full, name) = component_type(shape.as_ref());
                let prop = format!("Partial<{}> & {{name: string}}", authoring("ComponentPropDoc"));
                let entry = format!("Partial<Omit<{}, 'props'>> & {{name: string; props?: Array<{prop}>}}", authoring("ComponentEntry"));
                return (format!("Omit<Partial<{full}>, 'props' | 'components'> & {{props?: Array<{prop}>; components?: Array<{entry}>}}"), name);
            }
            component_type(shape.as_ref())
        }
        "hooks" => {
            if translation && !has("params") {
                return named("HookTranslationDoc");
            }
            if translation {
                return (format!("Partial<{}>", authoring("HookDoc")), "HookDoc".into());
            }
            named("HookDoc")
        }
        "templates" => named(if core { "TemplateDoc" } else { "IntegrationTemplateDoc" }),
        "docs-overlay" => named("ReferenceTranslationDoc"),
        "themes" => named("ThemeDoc"),
        "icon-sets" => {
            if shape.as_ref().and_then(|s| s.stamp.as_deref()) == Some("icon-definition") {
                named("IconDefinitionDoc")
            } else {
                named("IconSetDoc")
            }
        }
        _ => {
            if translation {
                return named("ReferenceTranslationDoc");
            }
            let n = shape.as_ref().and_then(|s| s.stamp.as_deref()).and_then(docs_root_type);
            if n == Some("ComponentDoc") {
                return component_type(shape.as_ref());
            }
            let type_name = if core && n == Some("IntegrationTemplateDoc") { "TemplateDoc" } else { n.unwrap_or("ReferenceDoc") };
            named(type_name)
        }
    }
}

struct Exported {
    name: String,
    statement: JsValue,
    expression: JsValue,
}

fn module_exports(t: &mut Ts, sf: &JsValue) -> Vec<Exported> {
    let mut locals: Vec<(String, JsValue, JsValue)> = Vec::new();
    let mut exported: Vec<Exported> = Vec::new();
    let set = |exported: &mut Vec<Exported>, name: String, statement: JsValue, expression: JsValue| {
        match exported.iter_mut().find(|e| e.name == name) {
            Some(e) => {
                e.statement = statement;
                e.expression = expression;
            }
            None => exported.push(Exported { name, statement, expression }),
        }
    };
    let export_kw = t.enum_value("SyntaxKind", "ExportKeyword");
    let stmts = t.get(sf, "statements");
    let stmts = t.items(&stmts);
    for st in &stmts {
        if t.is("isVariableStatement", st) {
            let mods = t.get(st, "modifiers");
            let is_exported = t.items(&mods).iter().any(|m| t.kind(m) == export_kw);
            let dl = t.get(st, "declarationList");
            let decls = t.get(&dl, "declarations");
            for d in t.items(&decls) {
                let name = t.get(&d, "name");
                let init = t.get(&d, "initializer");
                if !t.is("isIdentifier", &name) || init.is_undefined() || init.is_null() {
                    continue;
                }
                let n = t.get(&name, "text");
                let n = t.s(&n);
                locals.retain(|(k, _, _)| *k != n);
                locals.push((n.clone(), st.clone(), init.clone()));
                if is_exported {
                    set(&mut exported, n, st.clone(), init);
                }
            }
        } else if t.is("isExportAssignment", st) && !t.get(st, "isExportEquals").to_boolean() {
            let e = t.get(st, "expression");
            set(&mut exported, "default".into(), st.clone(), e);
        }
    }
    for st in &stmts {
        let spec = t.get(st, "moduleSpecifier");
        let clause = t.get(st, "exportClause");
        if t.is("isExportDeclaration", st) && (spec.is_undefined() || spec.is_null()) && !clause.is_undefined() && !clause.is_null() && t.is("isNamedExports", &clause) {
            let els = t.get(&clause, "elements");
            for el in t.items(&els) {
                let pn = t.get(&el, "propertyName");
                let nm = t.get(&el, "name");
                let local_node = if pn.is_undefined() || pn.is_null() { nm.clone() } else { pn };
                let lv = t.get(&local_node, "text");
                let local = t.s(&lv);
                let ev = t.get(&nm, "text");
                let ename = t.s(&ev);
                if let Some((_, s, e)) = locals.iter().find(|(k, _, _)| *k == local).cloned() {
                    set(&mut exported, ename, s, e);
                }
            }
        }
    }
    for i in 0..exported.len() {
        let mut expression = exported[i].expression.clone();
        for _ in 0..3 {
            if !t.is("isIdentifier", &expression) {
                break;
            }
            let tv = t.get(&expression, "text");
            let text = t.s(&tv);
            let Some((_, s, e)) = locals.iter().find(|(k, _, _)| *k == text).cloned() else { break };
            expression = e.clone();
            exported[i].statement = s;
            exported[i].expression = e;
        }
    }
    exported
}

fn unwrap(t: &mut Ts, expression: &JsValue) -> (JsValue, Vec<JsValue>) {
    let mut wrappers = Vec::new();
    let mut node = expression.clone();
    loop {
        if t.is("isParenthesizedExpression", &node)
            || t.is("isAsExpression", &node)
            || t.is("isNonNullExpression", &node)
            || t.is("isSatisfiesExpression", &node)
            || t.is("isTypeAssertionExpression", &node)
        {
            wrappers.push(node.clone());
            node = t.get(&node, "expression");
            continue;
        }
        return (node, wrappers);
    }
}

struct Target {
    export_name: String,
    node: JsValue,
    type_expr: String,
    type_name: String,
    blank: Vec<JsValue>,
    blank_ranges: Vec<(usize, usize)>,
}

fn targets_of(t: &mut Ts, sf: &JsValue, root: &str, core: bool) -> Vec<Target> {
    let exported = module_exports(t, sf);
    let mut names: Vec<String> = Vec::new();
    if let Some(m) = main_exports(root).iter().find(|n| exported.iter().any(|e| e.name == **n)) {
        names.push(m.to_string());
    }
    if root != "templates" && root != "themes" && root != "icon-sets" {
        for n in TRANSLATIONS {
            if exported.iter().any(|e| e.name == *n) {
                names.push(n.to_string());
            }
        }
    }
    let mut targets = Vec::new();
    let mut seen: Vec<JsValue> = Vec::new();
    for export_name in names {
        let entry = exported.iter().find(|e| e.name == export_name).unwrap();
        let (node, wrappers) = unwrap(t, &entry.expression);
        if seen.iter().any(|s| t.same(s, &node)) {
            continue;
        }
        seen.push(node.clone());
        let mut blank_ranges = Vec::new();
        for w in &wrappers {
            let wexpr = t.get(w, "expression");
            if t.is("isTypeAssertionExpression", w) {
                let a = t.start(w, sf) as usize;
                let b = t.start(&wexpr, sf) as usize;
                blank_ranges.push((a, b));
            } else if !t.is("isParenthesizedExpression", w) && !t.is("isNonNullExpression", w) && t.end(w) > t.end(&wexpr) {
                blank_ranges.push((t.end(&wexpr) as usize, t.end(w) as usize));
            }
        }
        if t.is("isVariableStatement", &entry.statement) {
            let dl = t.get(&entry.statement, "declarationList");
            let decls = t.get(&dl, "declarations");
            for d in t.items(&decls) {
                let init = t.get(&d, "initializer");
                let ty = t.get(&d, "type");
                if t.same(&init, &entry.expression) && !ty.is_undefined() && !ty.is_null() {
                    let name = t.get(&d, "name");
                    blank_ranges.push((t.end(&name) as usize, t.end(&ty) as usize));
                }
            }
        }
        let (type_expr, type_name) = expected_type(t, root, &export_name, &node, core);
        let mut blank = vec![entry.statement.clone()];
        blank.extend(wrappers);
        targets.push(Target { export_name, node, type_expr, type_name, blank, blank_ranges });
    }
    targets
}

struct Virtual {
    text: String,
    insertions: Vec<(usize, Vec<u16>)>,
}

impl Virtual {
    fn to_original(&self, virtual_: usize) -> usize {
        let mut shift = 0usize;
        for (at, text) in &self.insertions {
            let virtual_at = at + shift;
            if virtual_ < virtual_at {
                return virtual_ - shift;
            }
            if virtual_ < virtual_at + text.len() {
                return *at;
            }
            shift += text.len();
        }
        virtual_ - shift
    }
}

fn instrument(t: &mut Ts, sf: &JsValue, targets: &[Target], is_ts: bool, removed: &[(usize, usize)], casts: &[(usize, usize)]) -> Virtual {
    let text_v = t.get(sf, "text");
    let text = t.s(&text_v);
    let mut chars: Vec<u16> = text.encode_utf16().collect();
    let blank = |chars: &mut Vec<u16>, from: usize, to: usize| {
        for c in chars.iter_mut().take(to.min(usize::MAX)).skip(from) {
            if *c != b'\n' as u16 && *c != b'\r' as u16 {
                *c = b' ' as u16;
            }
        }
    };
    for (a, b) in removed {
        blank(&mut chars, *a, *b);
    }
    let text_js = t.str(&text);
    for target in targets {
        for node in &target.blank {
            let pos = t.get(node, "pos");
            let ranges = t.f("getLeadingCommentRanges", &[text_js.clone(), pos]);
            for r in t.items(&ranges) {
                let p = t.get(&r, "pos");
                let p = t.n(&p) as usize;
                let e = t.get(&r, "end");
                let e = t.n(&e) as usize;
                let comment = String::from_utf16_lossy(&chars[p..e.min(chars.len())]);
                let orig = String::from_utf16_lossy(&text.encode_utf16().collect::<Vec<u16>>()[p..e]);
                let _ = comment;
                if orig.starts_with("/**") && crate::doctor_re!(r"@(?:type|satisfies)\b").find(&orig).is_some() {
                    blank(&mut chars, p, e);
                }
            }
        }
        for (a, b) in &target.blank_ranges {
            blank(&mut chars, *a, *b);
        }
    }
    let mut insertions: Vec<(usize, Vec<u16>)> = Vec::new();
    for target in targets {
        let start = t.start(&target.node, sf) as usize;
        let end = t.end(&target.node) as usize;
        if is_ts {
            insertions.push((start, "(".encode_utf16().collect()));
            insertions.push((end, format!(") satisfies {}", target.type_expr).encode_utf16().collect()));
        } else {
            insertions.push((start, format!("/** @satisfies {{{}}} */ (", target.type_expr).encode_utf16().collect()));
            insertions.push((end, ")".encode_utf16().collect()));
        }
    }
    for (a, b) in casts {
        insertions.push((*a, (if is_ts { "(" } else { "/** @type {any} */ (" }).encode_utf16().collect()));
        insertions.push((*b, (if is_ts { " as any)" } else { ")" }).encode_utf16().collect()));
    }
    // A stable sort by position, as Array#sort.
    insertions.sort_by_key(|(a, _)| *a);
    let mut out: Vec<u16> = Vec::new();
    let mut cursor = 0usize;
    for (at, txt) in &insertions {
        out.extend_from_slice(&chars[cursor..*at]);
        out.extend_from_slice(txt);
        cursor = *at;
    }
    out.extend_from_slice(&chars[cursor..]);
    Virtual { text: String::from_utf16_lossy(&out), insertions }
}

fn descend(t: &mut Ts, sf: &JsValue, node: &JsValue, pos: f64) -> Option<JsValue> {
    for c in t.children(node) {
        if t.start(&c, sf) <= pos && pos < t.end(&c) {
            return Some(c);
        }
    }
    None
}

enum Part {
    Key(String),
    Index(i64),
}

fn is_prop_like(t: &mut Ts, n: &JsValue) -> bool {
    t.is("isPropertyAssignment", n) || t.is("isShorthandPropertyAssignment", n) || t.is("isMethodDeclaration", n)
}

fn field_path_at(t: &mut Ts, sf: &JsValue, root: &JsValue, pos: f64) -> Vec<Part> {
    let mut parts = Vec::new();
    let mut node = root.clone();
    while let Some(next) = descend(t, sf, &node, pos) {
        if t.is("isArrayLiteralExpression", &node) {
            let els = t.get(&node, "elements");
            let idx = t.items(&els).iter().position(|e| t.same(e, &next)).map(|i| i as i64).unwrap_or(-1);
            parts.push(Part::Index(idx));
        }
        if is_prop_like(t, &next) {
            let name = t.get(&next, "name");
            if !name.is_undefined() && !name.is_null() {
                if let Some(k) = property_name(t, &name) {
                    parts.push(Part::Key(k));
                }
            }
        }
        node = next;
    }
    parts
}

fn format_path(parts: &[Part]) -> String {
    let mut out = String::new();
    for (i, p) in parts.iter().enumerate() {
        match p {
            Part::Index(n) => out.push_str(&format!("[{n}]")),
            Part::Key(k) if i == 0 => out.push_str(k),
            Part::Key(k) => out.push_str(&format!(".{k}")),
        }
    }
    out
}

fn shorten(message: &str) -> String {
    let collapsed = crate::doctor_re!(r"\s+", "g").find_iter(message).fold((String::new(), 0usize), |(mut acc, last), m| {
        acc.push_str(&message[last..m.start()]);
        acc.push(' ');
        (acc, m.end())
    });
    let mut s = collapsed.0;
    s.push_str(&message[collapsed.1..]);
    let re = crate::doctor_re!(r"'([^']{90,})'", "g");
    let mut out = String::new();
    let mut last = 0;
    for m in re.find_iter(&s) {
        out.push_str(&s[last..m.start()]);
        let ty: Vec<u16> = s[m.group(1).unwrap()].encode_utf16().collect();
        out.push('\'');
        out.push_str(&String::from_utf16_lossy(&ty[..70.min(ty.len())]));
        out.push_str("…'");
        last = m.end();
    }
    out.push_str(&s[last..]);
    out.trim_matches(crate::discovery::paths::js_ws).to_string()
}

fn chain_of(t: &mut Ts, message_text: &JsValue) -> Vec<String> {
    if let Some(s) = message_text.as_string() {
        return vec![s.to_std_string_lossy()];
    }
    let mut out = Vec::new();
    let mut chain = message_text.clone();
    loop {
        let m = t.get(&chain, "messageText");
        out.push(t.s(&m));
        let next = t.get(&chain, "next");
        let items = t.items(&next);
        match items.first() {
            Some(n) => chain = n.clone(),
            None => break,
        }
    }
    out
}

fn property_range_at(t: &mut Ts, sf: &JsValue, root: &JsValue, pos: f64, text: &[u16]) -> Option<(usize, usize)> {
    let mut found: Option<JsValue> = None;
    let mut node = root.clone();
    while let Some(next) = descend(t, sf, &node, pos) {
        if is_prop_like(t, &next) {
            let name = t.get(&next, "name");
            if !name.is_undefined() && !name.is_null() && t.start(&name, sf) <= pos && pos < t.end(&name) {
                found = Some(next.clone());
            }
        }
        node = next;
    }
    let found = found?;
    let mut end = t.end(&found) as usize;
    let mut i = end;
    while i < text.len() && is_js_space(text[i]) {
        i += 1;
    }
    if text.get(i) == Some(&(b',' as u16)) {
        end = i + 1;
    }
    Some((t.start(&found, sf) as usize, end))
}

fn is_js_space(c: u16) -> bool {
    char::from_u32(c as u32).map(crate::discovery::paths::js_ws).unwrap_or(false)
}

fn value_range_at(t: &mut Ts, sf: &JsValue, root: &JsValue, pos: f64) -> Option<(usize, usize)> {
    let mut found: Option<JsValue> = None;
    let mut node = root.clone();
    while let Some(next) = descend(t, sf, &node, pos) {
        if t.is("isPropertyAssignment", &next) {
            let name = t.get(&next, "name");
            if t.start(&name, sf) <= pos && pos < t.end(&name) {
                found = Some(t.get(&next, "initializer"));
            } else if t.is("isArrayLiteralExpression", &node) {
                found = Some(next.clone());
            }
        } else if t.is("isArrayLiteralExpression", &node) {
            found = Some(next.clone());
        }
        node = next;
    }
    let f = found?;
    if t.same(&f, root) {
        return None;
    }
    Some((t.start(&f, sf) as usize, t.end(&f) as usize))
}

fn object_range_at(t: &mut Ts, sf: &JsValue, root: &JsValue, pos: f64) -> Option<(usize, usize)> {
    let mut found: Option<JsValue> = None;
    let mut node = root.clone();
    while let Some(next) = descend(t, sf, &node, pos) {
        if t.is("isObjectLiteralExpression", &next) {
            found = Some(next.clone());
        }
        node = next;
    }
    let f = found?;
    if t.same(&f, root) {
        return None;
    }
    Some((t.start(&f, sf) as usize, t.end(&f) as usize))
}

fn reexport_source(t: &mut Ts, sf: &JsValue, names: &[&str]) -> Option<String> {
    let stmts = t.get(sf, "statements");
    for st in t.items(&stmts) {
        let spec = t.get(&st, "moduleSpecifier");
        if !t.is("isExportDeclaration", &st) || spec.is_undefined() || spec.is_null() || !t.is("isStringLiteral", &spec) {
            continue;
        }
        let clause = t.get(&st, "exportClause");
        let hit = if clause.is_undefined() || clause.is_null() {
            true
        } else if t.is("isNamedExports", &clause) {
            let els = t.get(&clause, "elements");
            t.items(&els).iter().any(|e| {
                let n = t.get(e, "name");
                let n = t.get(&n, "text");
                let n = t.s(&n);
                names.contains(&n.as_str())
            })
        } else {
            false
        };
        if hit {
            let tx = t.get(&spec, "text");
            return Some(t.s(&tx));
        }
    }
    None
}

fn unquote_set_aside(message: &str) -> String {
    use crate::commands::doctor::util::JsRe;
    let a = crate::doctor_re!(r"\btype '\{[^']*\bany\b[^']*\}'", "g").replace_all(message, "this value");
    crate::doctor_re!(r"^Type '\{[^']*\bany\b[^']*\}'").replace(&a, "This value")
}

fn unquote(name: &str) -> String {
    if name.len() >= 2 && name.starts_with('"') && name.ends_with('"') {
        name[1..name.len() - 1].to_string()
    } else {
        name.to_string()
    }
}

fn ident_like(s: &str) -> bool {
    crate::doctor_re!(r"^[A-Za-z_$][\w$]*$").find(s).is_some()
}

#[derive(Clone)]
pub struct Finding {
    pub doc: String,
    pub line: usize,
    pub export: String,
    pub type_: String,
    pub field: String,
    pub problem: &'static str,
    pub message: String,
    pub fix: String,
}

impl Finding {
    pub fn to_json(&self) -> Value {
        let mut m = Map::new();
        m.insert("doc".into(), Value::String(self.doc.clone()));
        m.insert("line".into(), Value::from(self.line));
        m.insert("export".into(), Value::String(self.export.clone()));
        m.insert("type".into(), Value::String(self.type_.clone()));
        m.insert("severity".into(), Value::String("warning".into()));
        m.insert("field".into(), Value::String(self.field.clone()));
        m.insert("problem".into(), Value::String(self.problem.into()));
        m.insert("message".into(), Value::String(self.message.clone()));
        m.insert("fix".into(), Value::String(self.fix.clone()));
        Value::Object(m)
    }
}

fn cap1(re: &regress::Regex, s: &str, g: usize) -> Option<String> {
    re.find(s).and_then(|m| m.group(g).map(|r| s[r].to_string()))
}

fn findings_for(t: &mut Ts, diagnostic: &JsValue, ast_path: Vec<Part>, root: &str, doc: &str, line: usize, export_name: &str, type_name: &str) -> Vec<Finding> {
    use crate::commands::doctor::util::JsRe;
    let mt = t.get(diagnostic, "messageText");
    let chain: Vec<String> = chain_of(t, &mt).into_iter().map(|m| crate::doctor_re!(r" & Partial<Record<[^']*", "g").replace_all(&m, "")).collect();
    let below: Vec<String> = chain.iter().filter_map(|m| cap1(crate::doctor_re!(r"^Types of property '([^']+)' are incompatible"), m, 1)).collect();
    let mut parts = ast_path;
    for key in below {
        let last_same = matches!(parts.last(), Some(Part::Key(k)) if *k == key);
        if !last_same {
            parts.push(Part::Key(key));
        }
    }
    let leaf = chain.last().cloned().unwrap_or_default();
    let base = |field: String, problem: &'static str, message: String, fix: String| Finding {
        doc: doc.into(),
        line,
        export: export_name.into(),
        type_: type_name.into(),
        field,
        problem,
        message,
        fix,
    };
    let missing: Option<Vec<String>> = match cap1(crate::doctor_re!(r"Property '([^']+)' is missing in type"), &leaf, 1) {
        Some(k) => Some(vec![k]),
        None => cap1(crate::doctor_re!(r"is missing the following properties from type '[^']*': (.+?)(?:, and \d+ more)?\.?$"), &leaf, 1).map(|s| s.split(", ").map(String::from).collect()),
    };
    if let Some(missing) = missing.filter(|m| !m.is_empty()) {
        let owner_m = crate::doctor_re!(r"required in type '([^']+)'|from type '([^']+)'").find(&leaf);
        let named = owner_m.as_ref().and_then(|m| m.group(1).or(m.group(2)).map(|r| leaf[r].to_string()));
        let owner_type = match named {
            Some(n) if ident_like(&n) => n,
            _ => type_name.to_string(),
        };
        let source = cap1(crate::doctor_re!(r"^Type '(.*)' is missing the following properties"), &leaf, 1);
        let n = missing.len();
        return missing
            .iter()
            .map(|name| {
                let key = unquote(name);
                let mut p: Vec<Part> = parts.iter().map(|x| match x { Part::Key(k) => Part::Key(k.clone()), Part::Index(i) => Part::Index(*i) }).collect();
                p.push(Part::Key(key.clone()));
                let field = format_path(&p);
                let message = if n > 1 {
                    format!(
                        "Property '{key}' is missing{} but required in type '{owner_type}'.",
                        source.as_ref().map(|s| format!(" in type '{s}'")).unwrap_or_default()
                    )
                } else {
                    leaf.clone()
                };
                let fix = format!("Add `{field}`: {} requires it.", shorten(&owner_type));
                base(field, "missing_field", shorten(&message), fix)
            })
            .collect();
    }
    let known_line = chain.iter().find(|m| m.contains("Object literal may only specify known properties")).cloned().unwrap_or_default();
    let unknown_re = crate::doctor_re!(r"Object literal may only specify known properties, (?:and|but) '([^']+)' does not exist in type '([^']+)'(?:\. Did you mean to write '([^']+)'\?)?");
    if let Some(m) = unknown_re.find(&known_line) {
        let key = unquote(&known_line[m.group(1).unwrap()]);
        let owner_raw = known_line[m.group(2).unwrap()].to_string();
        let owner = if ident_like(&owner_raw) { owner_raw } else { type_name.to_string() };
        let suggestion = m.group(3).map(|r| unquote(&known_line[r]));
        let last_same = matches!(parts.last(), Some(Part::Key(k)) if *k == key);
        if !last_same {
            parts.push(Part::Key(key.clone()));
        }
        let field = format_path(&parts);
        let fix = match suggestion {
            Some(s) => format!("Rename `{field}` to `{s}`."),
            None => format!("Remove `{field}`: {} has no field `{key}`.", shorten(&owner)),
        };
        return vec![base(field, "unknown_field", shorten(&leaf), fix)];
    }
    let field = format_path(&parts);
    let did_you_mean = cap1(crate::doctor_re!(r"Did you mean '([^']+)'\?"), &chain.join(" "), 1);
    let assignable = chain.iter().rev().find_map(|m| cap1(crate::doctor_re!(r"is not assignable to type '([^']+)'"), m, 1));
    let shown_field = if field.is_empty() { "the doc".to_string() } else { field.clone() };
    let fix = if field == "type" && root == "components" {
        "This doc is in the components root, so it is a component doc: set type: 'component', or move it to the docs root.".to_string()
    } else if let Some(d) = did_you_mean {
        format!("Change `{shown_field}` to {d}.")
    } else if let Some(a) = assignable {
        let s = shorten(&format!("'{a}'"));
        let inner: Vec<u16> = s.encode_utf16().collect();
        let inner = String::from_utf16_lossy(&inner[1..inner.len().saturating_sub(1).max(1)]);
        format!("Change `{shown_field}` to a value of type {inner}.")
    } else {
        format!("Make `{shown_field}` match {type_name}.")
    };
    vec![base(field, "wrong_type", shorten(&leaf), fix)]
}

struct Entry {
    path: String,
    root: String,
    sf: JsValue,
    text16: Vec<u16>,
    targets: Vec<Target>,
    is_ts: bool,
    virtual_: Virtual,
    virtual_sf: JsValue,
    removed: Vec<(usize, usize)>,
    casts: Vec<(usize, usize)>,
    seen: Vec<String>,
}

pub struct Report {
    pub value: Value,
}

fn create_source_file(t: &mut Ts, file: &str, text: &str, is_ts: bool) -> JsValue {
    let latest = t.enum_value("ScriptTarget", "Latest");
    let kind = t.enum_value("ScriptKind", if is_ts { "TS" } else { "JS" });
    let (f, tx) = (t.str(file), t.str(text));
    t.f("createSourceFile", &[f, tx, JsValue::from(latest), JsValue::from(true), JsValue::from(kind)])
}

fn line_of(t: &mut Ts, sf: &JsValue, pos: usize) -> usize {
    let lc = t.m(sf, "getLineAndCharacterOfPosition", &[JsValue::from(pos as f64)]);
    let l = t.get(&lc, "line");
    t.n(&l) as usize + 1
}

/// `checkDocTypes(files, {packageDir, resolveFrom, core})`.
pub fn check_doc_types(files: &[(String, String)], package_dir: &str, resolve_from: &[&str], core: bool) -> Value {
    let rel = |f: &str| np::relative(package_dir, f);
    let mut skipped = |reason: String| {
        let mut m = Map::new();
        m.insert("status".into(), Value::String("skipped".into()));
        m.insert("reason".into(), Value::String(reason));
        m.insert("docs".into(), Value::from(0));
        m.insert("findings".into(), Value::Array(vec![]));
        m.insert("unchecked".into(), Value::Array(vec![]));
        Value::Object(m)
    };
    if files.is_empty() {
        let mut m = Map::new();
        m.insert("status".into(), Value::String("checked".into()));
        m.insert("docs".into(), Value::from(0));
        m.insert("findings".into(), Value::Array(vec![]));
        m.insert("unchecked".into(), Value::Array(vec![]));
        return Value::Object(m);
    }
    let authoring_types = np::resolve(&[&crate::discovery::paths::cli_root(), "authoring", "index.d.ts"]);
    let result = super::with_typescript(resolve_from, |t, version| {
        let mm = {
            let ts: JsValue = t.ts.clone().into();
            let v = t.get(&ts, "versionMajorMinor");
            if v.is_undefined() { version.to_string() } else { t.s(&v) }
        };
        let mut nums = mm.split('.').map(|x| x.parse::<f64>().unwrap_or(f64::NAN));
        let major = nums.next().unwrap_or(0.0);
        let minor = nums.next().unwrap_or(0.0);
        let has_js = files.iter().any(|(p, _)| !p.ends_with(".ts"));
        let (nmaj, nmin) = if has_js { (5.0, 0.0) } else { (4.0, 9.0) };
        if major < nmaj || (major == nmaj && minor < nmin) {
            return Err(format!(
                "TypeScript {version} cannot check {} against its type (that needs TypeScript {nmaj}.{nmin} or later), so docs were not checked. {}",
                if has_js { "a JavaScript doc" } else { "a doc" },
                super::TYPESCRIPT_FIX
            ));
        }
        let mut unchecked: Vec<(String, String)> = Vec::new();
        let mut entries: Vec<Entry> = Vec::new();
        for (path, root) in files {
            let text = match std::fs::read(path) {
                Ok(b) => String::from_utf8_lossy(&b).into_owned(),
                Err(e) => {
                    unchecked.push((rel(path), format!("it cannot be read: {}", node_open_error(&e, path))));
                    continue;
                }
            };
            let is_ts = path.ends_with(".ts");
            let sf = create_source_file(t, path, &text, is_ts);
            let targets = targets_of(t, &sf, root, core);
            if targets.is_empty() {
                let names = main_exports(root);
                let mut all: Vec<&str> = names.to_vec();
                all.extend(TRANSLATIONS);
                let from = reexport_source(t, &sf, &all);
                let reason = match from {
                    Some(f) => format!("it re-exports its doc from {f}, which this check does not follow, so it was not checked"),
                    None if !names.is_empty() => format!("it exports no doc the CLI reads ({})", names.join(" or ")),
                    None => format!("it exports no translation the CLI reads ({})", TRANSLATIONS.join(" or ")),
                };
                unchecked.push((rel(path), reason));
                continue;
            }
            let virtual_ = instrument(t, &sf, &targets, is_ts, &[], &[]);
            let vsf = create_source_file(t, path, &virtual_.text, is_ts);
            entries.push(Entry {
                path: path.clone(),
                root: root.clone(),
                sf,
                text16: text.encode_utf16().collect(),
                targets,
                is_ts,
                virtual_,
                virtual_sf: vsf,
                removed: vec![],
                casts: vec![],
                seen: vec![],
            });
        }
        // Compiler options and a host that serves the instrumented text.
        let o = |t: &mut Ts, g: &str, n: &str| JsValue::from(t.enum_value(g, n));
        let target = o(t, "ScriptTarget", "ES2022");
        let module = o(t, "ModuleKind", "ESNext");
        let resolution = o(t, "ModuleResolutionKind", "Bundler");
        let jsx = o(t, "JsxEmit", "ReactJSX");
        let types = t.arr(vec![]);
        let auth = t.str(&authoring_types);
        let auth_arr = t.arr(vec![auth]);
        let paths = t.obj(vec![(AUTHORING, auth_arr)]);
        let options = t.obj(vec![
            ("allowJs", JsValue::from(true)),
            ("checkJs", JsValue::from(true)),
            ("noEmit", JsValue::from(true)),
            ("skipLibCheck", JsValue::from(true)),
            ("strict", JsValue::from(true)),
            ("noImplicitAny", JsValue::from(false)),
            ("target", target),
            ("module", module),
            ("moduleResolution", resolution),
            ("jsx", jsx),
            ("resolveJsonModule", JsValue::from(true)),
            ("esModuleInterop", JsValue::from(true)),
            ("allowImportingTsExtensions", JsValue::from(true)),
            ("types", types),
            ("paths", paths),
        ]);
        let host = t.f("createCompilerHost", std::slice::from_ref(&options));
        // Instrumented files by resolved path: a JS object the host reads.
        let virtual_sfs = t.obj(vec![]);
        let virtual_texts = t.obj(vec![]);
        let parsed = t.obj(vec![]);
        for e in &entries {
            let key = np::resolve1(&e.path);
            t.set(&virtual_sfs, &key, e.virtual_sf.clone());
            let tx = t.str(&e.virtual_.text);
            t.set(&virtual_texts, &key, tx);
        }
        let orig_get = t.get(&host, "getSourceFile");
        let orig_read = t.get(&host, "readFile");
        let get_sf = t.func(
            (virtual_sfs.clone(), parsed.clone(), orig_get, host.clone()),
            |_, args, (vsfs, parsed, orig, host), ctx| {
                let name = args.first().cloned().unwrap_or_default();
                let name_s = name.to_string(ctx)?.to_std_string_lossy();
                let key = crate::discovery::nodepath::resolve1(&name_s);
                let vo = vsfs.as_object().unwrap();
                let hit = vo.get(boa_engine::JsString::from(key.as_str()), ctx)?;
                if !hit.is_undefined() {
                    return Ok(hit);
                }
                let po = parsed.as_object().unwrap();
                let k = boa_engine::JsString::from(name_s.as_str());
                if po.has_own_property(k.clone(), ctx)? {
                    return po.get(k, ctx);
                }
                let f = orig.as_object().unwrap();
                let v = f.call(host, args, ctx)?;
                po.set(k, v.clone(), true, ctx)?;
                Ok(v)
            },
        );
        t.set(&host, "getSourceFile", get_sf);
        let read = t.func((virtual_texts.clone(), orig_read, host.clone()), |_, args, (vt, orig, host), ctx| {
            let name = args.first().cloned().unwrap_or_default();
            let key = crate::discovery::nodepath::resolve1(&name.to_string(ctx)?.to_std_string_lossy());
            let hit = vt.as_object().unwrap().get(boa_engine::JsString::from(key.as_str()), ctx)?;
            if !hit.is_undefined() {
                return Ok(hit);
            }
            orig.as_object().unwrap().call(host, args, ctx)
        });
        t.set(&host, "readFile", read);

        let mut findings: Vec<Finding> = Vec::new();
        let mut stamped: Vec<String> = Vec::new();
        let mut checked: i64 = entries.iter().map(|e| e.targets.len() as i64).sum();
        let root_names: Vec<JsValue> = entries.iter().map(|e| JsValue::from(boa_engine::JsString::from(e.path.as_str()))).collect();
        let root_names = t.arr(root_names);
        let mut pending: Vec<usize> = (0..entries.len()).collect();
        let mut program = JsValue::undefined();
        let mut pass = 0usize;
        while !pending.is_empty() {
            if pass == MAX_PASSES {
                for &i in &pending {
                    unchecked.push((
                        rel(&entries[i].path),
                        format!("TypeScript still found new problems after {MAX_PASSES} passes, so not every field was checked; fix the ones reported and run the check again"),
                    ));
                }
                break;
            }
            let args = t.obj(vec![("rootNames", root_names.clone()), ("options", options.clone()), ("host", host.clone()), ("oldProgram", program.clone())]);
            program = t.f("createProgram", &[args]);
            let mut again: Vec<usize> = Vec::new();
            for &i in &pending {
                let path_js = t.str(&entries[i].path);
                let vsf = t.m(&program, "getSourceFile", &[path_js]);
                if vsf.is_undefined() || vsf.is_null() {
                    continue;
                }
                let doc = rel(&entries[i].path);
                let syn = t.m(&program, "getSyntacticDiagnostics", std::slice::from_ref(&vsf));
                if let Some(first) = t.items(&syn).first().cloned() {
                    if pass == 0 {
                        checked -= entries[i].targets.len() as i64;
                    }
                    let mt = t.get(&first, "messageText");
                    let sp = t.str(" ");
                    let flat = t.f("flattenDiagnosticMessageText", &[mt, sp]);
                    let flat = t.s(&flat);
                    unchecked.push((
                        doc,
                        format!(
                            "TypeScript {version} cannot parse it with its type check added ({flat}), so {}",
                            if pass == 0 { "it was not checked" } else { "not every field was checked" }
                        ),
                    ));
                    continue;
                }
                let mut changed = false;
                let sem = t.m(&program, "getSemanticDiagnostics", std::slice::from_ref(&vsf));
                for d in t.items(&sem) {
                    let code = t.get(&d, "code");
                    let code = t.n(&code);
                    let start = t.get(&d, "start");
                    if !RELEVANT.contains(&code) || start.is_undefined() || start.is_null() {
                        continue;
                    }
                    let pos = entries[i].virtual_.to_original(t.n(&start) as usize) as f64;
                    let sf = entries[i].sf.clone();
                    let mut target_idx = None;
                    for (ti, tg) in entries[i].targets.iter().enumerate() {
                        let node = tg.node.clone();
                        if t.start(&node, &sf) <= pos && pos <= t.end(&node) {
                            target_idx = Some(ti);
                            break;
                        }
                    }
                    let Some(ti) = target_idx else { continue };
                    let node = entries[i].targets[ti].node.clone();
                    let export_name = entries[i].targets[ti].export_name.clone();
                    let type_name = entries[i].targets[ti].type_name.clone();
                    let ast_path = field_path_at(t, &sf, &node, pos);
                    let line = line_of(t, &sf, pos as usize);
                    let root = entries[i].root.clone();
                    for mut finding in findings_for(t, &d, ast_path, &root, &doc, line, &export_name, &type_name) {
                        if finding.problem == "unknown_field" {
                            let text16 = entries[i].text16.clone();
                            if let Some(range) = property_range_at(t, &sf, &node, pos, &text16) {
                                if !entries[i].removed.iter().any(|(f, _)| *f == range.0) {
                                    entries[i].removed.push(range);
                                    changed = true;
                                }
                            }
                        } else if finding.problem == "missing_field" && (finding.field.contains('.') || finding.field.contains('[')) {
                            let range = value_range_at(t, &sf, &node, pos).or_else(|| object_range_at(t, &sf, &node, pos));
                            if let Some(range) = range {
                                if !entries[i].casts.iter().any(|(f, _)| *f == range.0) {
                                    entries[i].casts.push(range);
                                    changed = true;
                                }
                            }
                        } else if finding.problem == "wrong_type" {
                            let picked = finding.field == "type" && root == "docs" && !TRANSLATIONS.contains(&export_name.as_str());
                            if picked && !stamped.contains(&doc) {
                                stamped.push(doc.clone());
                                unchecked.push((
                                    doc.clone(),
                                    "its `type` names no type the docs root takes, so its other fields were not checked; fix the `type` and run the check again".into(),
                                ));
                            }
                            let range = if picked {
                                None
                            } else if finding.field.ends_with(".type") {
                                object_range_at(t, &sf, &node, pos)
                            } else {
                                value_range_at(t, &sf, &node, pos)
                            };
                            if let Some(range) = range {
                                if !entries[i].casts.iter().any(|(f, _)| *f == range.0) {
                                    entries[i].casts.push(range);
                                    changed = true;
                                }
                            }
                        }
                        let key = format!("{}\0{}\0{}", finding.export, finding.field, finding.problem);
                        if entries[i].seen.contains(&key) {
                            continue;
                        }
                        entries[i].seen.push(key);
                        if pass > 0 {
                            finding.message = unquote_set_aside(&finding.message);
                        }
                        findings.push(finding);
                    }
                }
                if changed {
                    let sf = entries[i].sf.clone();
                    let removed = entries[i].removed.clone();
                    let casts = entries[i].casts.clone();
                    let is_ts = entries[i].is_ts;
                    let v = instrument(t, &sf, &entries[i].targets, is_ts, &removed, &casts);
                    let vsf = create_source_file(t, &entries[i].path.clone(), &v.text, is_ts);
                    let key = np::resolve1(&entries[i].path);
                    t.set(&virtual_sfs, &key, vsf.clone());
                    let tx = t.str(&v.text);
                    t.set(&virtual_texts, &key, tx);
                    entries[i].virtual_ = v;
                    entries[i].virtual_sf = vsf;
                    again.push(i);
                }
            }
            pending = again;
            pass += 1;
        }
        let lc = crate::discovery::jsort::locale_compare;
        findings.sort_by(|a, b| lc(&a.doc, &b.doc).then(a.line.cmp(&b.line)).then(lc(&a.field, &b.field)));
        unchecked.sort_by(|a, b| lc(&a.0, &b.0));
        let mut m = Map::new();
        m.insert("status".into(), Value::String("checked".into()));
        m.insert("typescript".into(), Value::String(version.to_string()));
        m.insert("docs".into(), Value::from(checked));
        m.insert(
            "findings".into(),
            Value::Array(findings.iter().filter(|f| !stamped.contains(&f.doc) || f.field == "type").map(|f| f.to_json()).collect()),
        );
        m.insert(
            "unchecked".into(),
            Value::Array(
                unchecked
                    .into_iter()
                    .map(|(d, r)| {
                        let mut x = Map::new();
                        x.insert("doc".into(), Value::String(d));
                        x.insert("reason".into(), Value::String(r));
                        Value::Object(x)
                    })
                    .collect(),
            ),
        );
        Ok(Value::Object(m))
    });
    match result {
        Ok(Ok(v)) => v,
        Ok(Err(reason)) => skipped(reason),
        Err(None) => skipped(format!("TypeScript is not installed in this project, {MISSING_REASON_TAIL} {}", super::TYPESCRIPT_FIX)),
        Err(Some(v)) => skipped(super::unusable_reason(&v, "docs were not checked")),
    }
}

/// Node's message for a failed `readFileSync`.
fn node_open_error(e: &std::io::Error, path: &str) -> String {
    let (code, text) = match e.kind() {
        std::io::ErrorKind::NotFound => ("ENOENT", "no such file or directory"),
        std::io::ErrorKind::PermissionDenied => ("EACCES", "permission denied"),
        _ if e.raw_os_error() == Some(21) => ("EISDIR", "illegal operation on a directory"),
        _ => ("EIO", "i/o error"),
    };
    let verb = if code == "EISDIR" { "read" } else { "open" };
    if verb == "read" {
        format!("{code}: {text}, read")
    } else {
        format!("{code}: {text}, open '{path}'")
    }
}
