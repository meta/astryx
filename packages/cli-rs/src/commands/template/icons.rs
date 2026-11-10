//! Rewrite a template's icon imports to the project's icon set (AST-084
//! FR9, FR10). Port of foundation/discovery/template-icons.mjs and
//! loadTemplateIconSets (api/template/_adapter.mjs).

use crate::discovery::icon_set_discovery::{self as isd, DiscoveredIconSet, IconSetChoice};
use crate::json::{Map, Value};
use oxc::allocator::Allocator;
use oxc::ast::ast::*;
use oxc::parser::Parser;
use oxc::span::{GetSpan, SourceType};
use oxc_ast_visit::{walk, Visit};
use std::collections::{HashMap, HashSet};

pub struct IconSets {
    pub sets: Vec<DiscoveredIconSet>,
    pub choice: Option<IconSetChoice>,
}

/// `loadTemplateIconSets(cwd)`: only a project that opts in with
/// `experimental.iconSet` maps icons; anything else leaves them unchanged.
pub fn load(cwd: &str) -> IconSets {
    let none = IconSets { sets: Vec::new(), choice: None };
    let Ok(project) = crate::discovery::project::Project::load(cwd) else { return none };
    if !crate::discovery::paths::js_truthy(project.config.get("experimental").and_then(|e| e.get("iconSet"))) {
        return none;
    }
    let (sets, _w, choice) = isd::project_icon_sets(&project);
    if choice.configured.as_deref().map_or(true, |c| c.is_empty()) {
        return none;
    }
    IconSets { sets, choice: Some(choice) }
}

fn vs(v: &Value, k: &str) -> Option<String> {
    v.get(k).and_then(|x| x.as_str()).map(String::from)
}
fn arr<'a>(v: &'a Value, k: &str) -> Vec<&'a Value> {
    v.get(k).and_then(|x| x.as_array()).map(|a| a.iter().collect()).unwrap_or_default()
}

#[derive(Clone)]
struct Record {
    set_name: Option<String>,
    set_idx: Option<usize>,
    id: String,
    export: String,
    variant: Option<String>,
    definitions: Vec<String>,
}

fn index_sets(sets: &[DiscoveredIconSet]) -> HashMap<String, Record> {
    let astryx: HashSet<String> = crate::discovery::icon_definition_discovery::astryx_definitions_by_name().into_iter().map(|(n, _)| n).collect();
    let mut index: HashMap<String, Record> = HashMap::new();
    for (si, set) in sets.iter().enumerate() {
        let by_icon = isd::definitions_by_icon(&set.data);
        let set_module = vs(&set.data, "module").unwrap_or_default();
        for icon in arr(&set.data, "icons") {
            let module = vs(icon, "module").unwrap_or_else(|| set_module.clone());
            let id = vs(icon, "id").unwrap_or_default();
            let defs: Vec<String> = by_icon
                .iter()
                .find(|(i, _)| *i == id)
                .map(|(_, l)| l.iter().filter(|n| astryx.contains(*n)).cloned().collect())
                .unwrap_or_default();
            let export = vs(icon, "export").unwrap_or_default();
            let key = format!("{module}\0{export}");
            index.entry(key).or_insert_with(|| Record {
                set_name: Some(set.name.clone()),
                set_idx: Some(si),
                id: id.clone(),
                export: export.clone(),
                variant: set.data.get("default").and_then(|d| vs(d, "variant")).filter(|v| !v.is_empty()),
                definitions: defs.clone(),
            });
            for entry in arr(icon, "variants") {
                let vm = vs(entry, "module").unwrap_or_else(|| module.clone());
                let ve = vs(entry, "export").unwrap_or_default();
                index.entry(format!("{vm}\0{ve}")).or_insert_with(|| Record {
                    set_name: Some(set.name.clone()),
                    set_idx: Some(si),
                    id: id.clone(),
                    export: ve.clone(),
                    variant: vs(entry, "variant"),
                    definitions: defs.clone(),
                });
            }
        }
    }
    index
}

fn reviewed_match<'a>(source: &Record, target: &'a DiscoveredIconSet, confidences: &[&str]) -> Option<&'a Value> {
    let mut best: Option<(&Value, usize)> = None;
    for icon in arr(&target.data, "icons") {
        for m in arr(icon, "matches") {
            let conf = vs(m, "confidence").unwrap_or_default();
            let Some(rank) = confidences.iter().position(|c| *c == conf) else { continue };
            if vs(m, "set") != source.set_name || vs(m, "export").as_deref() != Some(source.export.as_str()) {
                continue;
            }
            if let Some(v) = m.get("variant").filter(|v| !v.is_null()) {
                if v.as_str() != source.variant.as_deref() {
                    continue;
                }
            }
            let better = match best {
                None => true,
                Some((bi, br)) => rank < br || (rank == br && vs(icon, "id").unwrap_or_default().encode_utf16().lt(vs(bi, "id").unwrap_or_default().encode_utf16())),
            };
            if better {
                best = Some((icon, rank));
            }
        }
    }
    best.map(|b| b.0)
}

fn match_icon<'a>(source: &Record, target: &'a DiscoveredIconSet) -> Option<(&'a Value, &'static str)> {
    if source.set_name.is_some() {
        if let Some(r) = reviewed_match(source, target, &["exact", "strong"]) {
            return Some((r, "match"));
        }
    }
    for name in &source.definitions {
        let id = target.data.get("map").and_then(|m| m.get(name)).and_then(|v| v.as_str());
        if let Some(id) = id {
            if let Some(icon) = arr(&target.data, "icons").into_iter().find(|i| vs(i, "id").as_deref() == Some(id)) {
                return Some((icon, "definition"));
            }
        }
    }
    None
}

fn target_export(icon: &Value, set: &DiscoveredIconSet, variant: Option<&str>) -> (String, String) {
    let module = vs(icon, "module").or_else(|| vs(&set.data, "module")).unwrap_or_default();
    let default_variant = set.data.get("default").and_then(|d| vs(d, "variant"));
    if let Some(v) = variant.filter(|v| !v.is_empty()) {
        if Some(v) != default_variant.as_deref() {
            if let Some(e) = arr(icon, "variants").into_iter().find(|e| vs(e, "variant").as_deref() == Some(v)) {
                return (vs(e, "module").unwrap_or(module), vs(e, "export").unwrap_or_default());
            }
        }
    }
    (module, vs(icon, "export").unwrap_or_default())
}

fn module_name_str(n: &ModuleExportName) -> String {
    match n {
        ModuleExportName::IdentifierName(i) => i.name.to_string(),
        ModuleExportName::IdentifierReference(i) => i.name.to_string(),
        ModuleExportName::StringLiteral(s) => s.value.as_str().unwrap_or("").to_string(),
    }
}

fn str_val(s: &StringLiteral) -> String {
    s.value.as_str().unwrap_or("").to_string()
}

struct Spec {
    kind: u8, // 0 named, 1 default, 2 namespace
    type_only: bool,
    imported: String,
    local: String,
    start: u32,
    end: u32,
}

impl Spec {
    fn key(&self) -> String {
        if self.kind == 0 { self.imported.clone() } else { self.local.clone() }
    }
}

struct Import {
    start: u32,
    end: u32,
    type_only: bool,
    module: String,
    src_start: u32,
    src_end: u32,
    specs: Vec<Spec>,
}

/// Identifier references and JSX opening elements, for renames and the
/// sizing-prop drop.
struct Walk {
    refs: Vec<(String, u32, u32, bool)>, // name, start, end, shorthand
    written: HashSet<String>,
    openings: Vec<(String, Vec<(String, u32, u32)>)>,
}

impl<'a> Visit<'a> for Walk {
    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        self.written.insert(it.name.to_string());
        self.refs.push((it.name.to_string(), it.span.start, it.span.end, false));
    }
    fn visit_identifier_name(&mut self, it: &IdentifierName<'a>) {
        self.written.insert(it.name.to_string());
    }
    fn visit_binding_identifier(&mut self, it: &BindingIdentifier<'a>) {
        self.written.insert(it.name.to_string());
    }
    fn visit_label_identifier(&mut self, it: &LabelIdentifier<'a>) {
        self.written.insert(it.name.to_string());
    }
    fn visit_jsx_identifier(&mut self, it: &JSXIdentifier<'a>) {
        self.written.insert(it.name.to_string());
    }
    fn visit_import_specifier(&mut self, it: &ImportSpecifier<'a>) {
        self.visit_binding_identifier(&it.local);
    }
    fn visit_object_property(&mut self, it: &ObjectProperty<'a>) {
        if it.shorthand {
            if let Expression::Identifier(id) = &it.value {
                self.written.insert(id.name.to_string());
                self.refs.push((id.name.to_string(), id.span.start, id.span.end, true));
                return;
            }
        }
        walk::walk_object_property(self, it);
    }
    fn visit_jsx_opening_element(&mut self, it: &JSXOpeningElement<'a>) {
        let name = match &it.name {
            JSXElementName::IdentifierReference(i) => Some(i.name.to_string()),
            JSXElementName::Identifier(i) => Some(i.name.to_string()),
            _ => None,
        };
        if let Some(n) = name {
            let attrs = it
                .attributes
                .iter()
                .filter_map(|a| match a {
                    JSXAttributeItem::Attribute(at) => match &at.name {
                        JSXAttributeName::Identifier(i) => Some((i.name.to_string(), at.span.start, at.span.end)),
                        _ => None,
                    },
                    _ => None,
                })
                .collect();
            self.openings.push((n, attrs));
        }
        walk::walk_jsx_opening_element(self, it);
    }
}

fn js_ws(c: char) -> bool {
    crate::commands::template::source::js_space(c)
}

/// `mapTemplateIcons(source, iconSets, declared)`: the rewritten source and
/// the icon report (`None` when the project uses no icon set).
pub fn map_template_icons(source: &str, iconsets: &IconSets, declared: Option<&Value>) -> (String, Option<Value>) {
    let Some(choice) = &iconsets.choice else { return (source.to_string(), None) };
    let sets = &iconsets.sets;
    let target = choice.set.and_then(|i| sets.get(i));
    let set_label = target.map(|t| format!("{}/{}", t.package, t.name));
    let mut icons = Map::new();
    icons.insert("status".into(), Value::String(choice.status.into()));
    icons.insert("set".into(), set_label.clone().map(Value::String).unwrap_or(Value::Null));
    icons.insert("reason".into(), Value::String(choice.reason.clone()));
    let mut mapped: Vec<Value> = Vec::new();
    let mut kept: Vec<Value> = Vec::new();
    let finish = |icons: &mut Map<String, Value>, mapped: Vec<Value>, kept: Vec<Value>| {
        icons.insert("mapped".into(), Value::Array(mapped));
        icons.insert("kept".into(), Value::Array(kept));
    };
    let Some(target) = target else {
        finish(&mut icons, mapped, kept);
        return (source.to_string(), Some(Value::Object(icons)));
    };
    let target_idx = choice.set.unwrap();
    let alloc = Allocator::default();
    let ret = Parser::new(&alloc, source, SourceType::tsx()).parse();
    if ret.diagnostics.has_errors() {
        finish(&mut icons, mapped, kept);
        return (source.to_string(), Some(Value::Object(icons)));
    }
    let program = &ret.program;
    let declared: Vec<(String, String)> = declared
        .and_then(|d| d.as_object())
        .map(|m| m.iter().map(|(k, v)| (k.clone(), v.as_str().unwrap_or("").to_string())).collect())
        .unwrap_or_default();
    let index = index_sets(sets);
    let tmod = vs(&target.data, "module").unwrap_or_default();
    let mut target_modules: HashSet<String> = HashSet::new();
    for icon in arr(&target.data, "icons") {
        let im = vs(icon, "module").unwrap_or_else(|| tmod.clone());
        target_modules.insert(im.clone());
        for v in arr(icon, "variants") {
            target_modules.insert(vs(v, "module").unwrap_or_else(|| im.clone()));
        }
    }
    let mut w = Walk { refs: Vec::new(), written: HashSet::new(), openings: Vec::new() };
    w.visit_program(program);
    let written = w.written.clone();

    // Imports and re-exports.
    let mut imports: Vec<Import> = Vec::new();
    let mut bindings: Vec<(String, String, String, &'static str)> = Vec::new(); // key, module, export, form
    for st in &program.body {
        match st {
            Statement::ImportDeclaration(imp) => {
                let module = str_val(&imp.source);
                let mut specs = Vec::new();
                for sp in imp.specifiers.iter().flatten() {
                    let s = match sp {
                        ImportDeclarationSpecifier::ImportSpecifier(x) => Spec {
                            kind: 0,
                            type_only: x.import_kind.is_type(),
                            imported: module_name_str(&x.imported),
                            local: x.local.name.to_string(),
                            start: x.span.start,
                            end: x.span.end,
                        },
                        ImportDeclarationSpecifier::ImportDefaultSpecifier(x) => Spec {
                            kind: 1,
                            type_only: false,
                            imported: "default".into(),
                            local: x.local.name.to_string(),
                            start: x.span.start,
                            end: x.span.end,
                        },
                        ImportDeclarationSpecifier::ImportNamespaceSpecifier(x) => Spec {
                            kind: 2,
                            type_only: false,
                            imported: "*".into(),
                            local: x.local.name.to_string(),
                            start: x.span.start,
                            end: x.span.end,
                        },
                    };
                    let type_only = imp.import_kind.is_type() || s.type_only;
                    let form = if type_only {
                        "type"
                    } else {
                        ["named", "default", "namespace"][s.kind as usize]
                    };
                    bindings.push((s.key(), module.clone(), s.imported.clone(), form));
                    specs.push(s);
                }
                imports.push(Import {
                    start: imp.span.start,
                    end: imp.span.end,
                    type_only: imp.import_kind.is_type(),
                    module,
                    src_start: imp.source.span.start,
                    src_end: imp.source.span.end,
                    specs,
                });
            }
            Statement::ExportFromDeclaration(e) => {
                let module = str_val(&e.source);
                for sp in &e.specifiers {
                    let local = module_name_str(&sp.local);
                    let exported = module_name_str(&sp.exported);
                    let mut keys = vec![local.clone()];
                    if exported != local {
                        keys.push(exported);
                    }
                    for k in keys {
                        bindings.push((k.clone(), module.clone(), k, "re-export"));
                    }
                }
            }
            _ => {}
        }
    }

    // Plan.
    let mut planned: HashMap<(usize, usize), (Record, Option<(&Value, &'static str)>)> = HashMap::new();
    let mut freed: HashSet<String> = HashSet::new();
    for (ii, imp) in imports.iter().enumerate() {
        if imp.type_only || target_modules.contains(&imp.module) {
            continue;
        }
        for (si, sp) in imp.specs.iter().enumerate() {
            if sp.kind == 2 || sp.type_only {
                continue;
            }
            let key = sp.key();
            let from_set = index.get(&format!("{}\0{}", imp.module, sp.imported));
            let meant = if !imp.module.starts_with("@astryxdesign/") {
                declared.iter().find(|(k, _)| *k == key).map(|(_, v)| v.clone())
            } else {
                None
            };
            let record = match (from_set, &meant) {
                (Some(r), _) => {
                    let mut defs: Vec<String> = Vec::new();
                    for d in meant.iter().cloned().chain(r.definitions.iter().cloned()) {
                        if !defs.contains(&d) {
                            defs.push(d);
                        }
                    }
                    let mut r = r.clone();
                    r.definitions = defs;
                    Some(r)
                }
                (None, Some(m)) => Some(Record {
                    set_name: None,
                    set_idx: None,
                    id: key.clone(),
                    export: sp.imported.clone(),
                    variant: None,
                    definitions: vec![m.clone()],
                }),
                _ => None,
            };
            let Some(record) = record else { continue };
            if record.set_idx == Some(target_idx) {
                continue;
            }
            let m = match_icon(&record, target);
            if m.is_some() {
                freed.insert(sp.local.clone());
            }
            planned.insert((ii, si), (record, m));
        }
    }

    let comments: Vec<(u32, u32)> = program.comments.iter().map(|c| (c.span.start, c.span.end)).collect();
    let mut edits: Vec<(usize, usize, String)> = Vec::new();
    let mut renames: HashMap<String, String> = HashMap::new();
    let mut added: indexmap::IndexMap<String, (String, String, String)> = indexmap::IndexMap::new(); // key -> (module, imported, local)
    let mut insert_at: Option<usize> = None;
    let mut accounted: HashSet<String> = HashSet::new();
    let mut mapped_locals: HashSet<String> = HashSet::new();
    let mut mapped_entries: Vec<(usize, String)> = Vec::new();
    let only_ws = |a: usize, b: usize| source[a..b].chars().all(js_ws);

    for (ii, imp) in imports.iter().enumerate() {
        if imp.type_only || target_modules.contains(&imp.module) {
            continue;
        }
        if !(0..imp.specs.len()).any(|si| planned.contains_key(&(ii, si))) {
            continue;
        }
        let mut keep: Vec<usize> = Vec::new();
        for (si, sp) in imp.specs.iter().enumerate() {
            let Some((record, m)) = planned.get(&(ii, si)) else {
                keep.push(si);
                continue;
            };
            accounted.insert(sp.key());
            let Some((icon, by)) = m else {
                keep.push(si);
                let likely = reviewed_match(record, target, &["likely"]);
                let set_l = set_label.clone().unwrap_or_default();
                let reason = if !record.definitions.is_empty() {
                    format!(
                        "{set_l} maps no icon to the icon definition \"{}\"{}",
                        record.definitions.join("\", \""),
                        if record.set_name.is_some() { ", and none is a reviewed match for it" } else { "" }
                    )
                } else {
                    format!("no icon in {set_l} is a reviewed match for it")
                };
                let mut k = Map::new();
                k.insert("module".into(), Value::String(imp.module.clone()));
                k.insert("export".into(), Value::String(sp.imported.clone()));
                k.insert("reason".into(), Value::String(reason));
                if let Some(l) = likely {
                    let (lm, le) = target_export(l, target, record.variant.as_deref());
                    let mut s = Map::new();
                    s.insert("set".into(), Value::String(target.name.clone()));
                    s.insert("id".into(), Value::String(vs(l, "id").unwrap_or_default()));
                    s.insert("module".into(), Value::String(lm));
                    s.insert("export".into(), Value::String(le));
                    s.insert("confidence".into(), Value::String("likely".into()));
                    k.insert("suggestion".into(), Value::Object(s));
                }
                kept.push(Value::Object(k));
                continue;
            };
            let (cm, ce) = target_export(icon, target, record.variant.as_deref());
            let key = format!("{cm}\0{ce}");
            if !added.contains_key(&key) {
                let base = if sp.kind == 1 { sp.local.clone() } else { ce.clone() };
                let mut name = base.clone();
                let mut n = 2;
                loop {
                    let taken = (written.contains(&name) && !freed.contains(&name)) || added.values().any(|e| e.2 == name);
                    if !taken {
                        break;
                    }
                    name = format!("{base}{n}");
                    n += 1;
                }
                added.insert(key.clone(), (cm.clone(), ce.clone(), name));
            }
            let entry_local = added[&key].2.clone();
            if sp.local != entry_local {
                renames.insert(sp.local.clone(), entry_local);
            }
            mapped_locals.insert(sp.local.clone());
            let mut src = Map::new();
            src.insert("module".into(), Value::String(imp.module.clone()));
            src.insert("export".into(), Value::String(sp.imported.clone()));
            let mut tg = Map::new();
            tg.insert("set".into(), Value::String(target.name.clone()));
            tg.insert("package".into(), Value::String(target.package.clone()));
            tg.insert("id".into(), Value::String(vs(icon, "id").unwrap_or_default()));
            tg.insert("module".into(), Value::String(cm));
            tg.insert("export".into(), Value::String(ce));
            let mut mi = Map::new();
            mi.insert("source".into(), Value::Object(src));
            mi.insert("target".into(), Value::Object(tg));
            mi.insert("by".into(), Value::String((*by).into()));
            mapped.push(Value::Object(mi));
            mapped_entries.push((mapped.len() - 1, sp.local.clone()));
        }
        if keep.len() == imp.specs.len() {
            continue;
        }
        if insert_at.is_none() {
            insert_at = Some(imp.start as usize);
        }
        let (ns, ne) = (imp.start, imp.end);
        let kept_ranges: Vec<(u32, u32)> = keep
            .iter()
            .map(|&si| {
                let (mut a, mut b) = (imp.specs[si].start, imp.specs[si].end);
                for c in &comments {
                    if c.0 < ns || c.1 > ne {
                        continue;
                    }
                    if c.0 >= b && only_ws(b as usize, c.0 as usize) {
                        b = c.1;
                    }
                }
                for c in comments.iter().rev() {
                    if c.0 < ns || c.1 > ne {
                        continue;
                    }
                    if c.1 <= a && only_ws(c.1 as usize, a as usize) {
                        a = c.0;
                    }
                }
                (a, b)
            })
            .collect();
        let inside: Vec<(u32, u32)> = comments
            .iter()
            .copied()
            .filter(|c| c.0 >= ns && c.1 <= ne && !kept_ranges.iter().any(|(a, b)| c.0 >= *a && c.1 <= *b))
            .collect();
        let mut moved: Vec<String> = inside.iter().map(|c| source[c.0 as usize..c.1 as usize].to_string()).collect();
        let above: String = moved.iter().map(|c| format!("{c}\n")).collect();
        if keep.is_empty() {
            let mut end = ne as usize;
            let tre = regress::Regex::with_flags(r"^[ \t]*(\/\/[^\n]*|\/\*[^\n]*?\*\/)[ \t]*(?=\n|$)", "u").unwrap();
            let rest = &source[end..];
            if let Some(m) = tre.find(rest) {
                moved.push(rest[m.group(1).unwrap()].to_string());
                end += m.end();
            }
            if source.as_bytes().get(end) == Some(&b'\n') {
                end += 1;
            }
            edits.push((ns as usize, end, moved.iter().map(|c| format!("{c}\n")).collect()));
        } else {
            let text_of = |k: usize| {
                let (a, b) = kept_ranges[k];
                source[a as usize..b as usize].to_string()
            };
            let mut parts: Vec<String> = Vec::new();
            for (k, &si) in keep.iter().enumerate() {
                if imp.specs[si].kind != 0 {
                    parts.push(text_of(k));
                }
            }
            let named: Vec<String> = keep.iter().enumerate().filter(|(_, si)| imp.specs[**si].kind == 0).map(|(k, _)| text_of(k)).collect();
            if !named.is_empty() {
                parts.push(format!("{{{}}}", named.join(", ")));
            }
            edits.push((
                ns as usize,
                ne as usize,
                format!("{above}import {} from {};", parts.join(", "), &source[imp.src_start as usize..imp.src_end as usize]),
            ));
        }
    }

    for (key, _) in &declared {
        if accounted.contains(key) {
            continue;
        }
        let forms: Vec<&(String, String, String, &str)> = bindings.iter().filter(|b| b.0 == *key).collect();
        let pick = |f: &dyn Fn(&&(String, String, String, &str)) -> bool| forms.iter().find(|b| f(b)).copied();
        let from_target = pick(&|b| target_modules.contains(&b.1));
        let from_astryx = pick(&|b| b.1.starts_with("@astryxdesign/"));
        let namespace = pick(&|b| b.3 == "namespace");
        let type_only = pick(&|b| b.3 == "type");
        let re_export = pick(&|b| b.3 == "re-export");
        let set_l = set_label.clone().unwrap_or_default();
        let (binding, reason) = if let Some(b) = from_target {
            (Some(b), format!("it is already imported from {set_l}"))
        } else if let Some(b) = namespace {
            (Some(b), "it is a namespace import, which is not mapped: import the icon by name".into())
        } else if let Some(b) = re_export {
            (Some(b), "the template re-exports it rather than importing it, so it is not mapped".into())
        } else if let Some(b) = type_only {
            (Some(b), "it is a type-only import, which draws no icon".into())
        } else if let Some(b) = from_astryx {
            (Some(b), "it is imported from an Astryx package, which ships components, not icons".into())
        } else {
            (None, "the template does not import it".to_string())
        };
        let mut k = Map::new();
        k.insert("module".into(), binding.map(|b| Value::String(b.1.clone())).unwrap_or(Value::Null));
        k.insert("export".into(), Value::String(binding.map(|b| b.2.clone()).unwrap_or_else(|| key.clone())));
        k.insert("reason".into(), Value::String(reason));
        kept.push(Value::Object(k));
    }

    if added.is_empty() {
        finish(&mut icons, mapped, kept);
        return (source.to_string(), Some(Value::Object(icons)));
    }
    for (name, s, e, shorthand) in &w.refs {
        if let Some(next) = renames.get(name) {
            let text = if *shorthand { format!("{name}: {next}") } else { next.clone() };
            edits.push((*s as usize, *e as usize, text));
        }
    }
    let mut dropped: HashMap<String, Vec<String>> = HashMap::new();
    for (local, attrs) in &w.openings {
        if !mapped_locals.contains(local) {
            continue;
        }
        for (an, s, e) in attrs {
            if !["size", "strokeWidth", "absoluteStrokeWidth"].contains(&an.as_str()) {
                continue;
            }
            let mut start = *s as usize;
            while start > 0 {
                let prev = source[..start].chars().last().unwrap();
                if !js_ws(prev) {
                    break;
                }
                start -= prev.len_utf8();
            }
            edits.push((start, *e as usize, String::new()));
            let l = dropped.entry(local.clone()).or_default();
            if !l.contains(an) {
                l.push(an.clone());
            }
        }
    }
    for (i, local) in &mapped_entries {
        if let Some(props) = dropped.get(local) {
            let mut p = props.clone();
            p.sort();
            if let Some(Value::Object(m)) = mapped.get_mut(*i) {
                m.insert("dropped".into(), Value::Array(p.into_iter().map(Value::String).collect()));
            }
        }
    }
    let mut unique: indexmap::IndexMap<String, (usize, usize, String)> = indexmap::IndexMap::new();
    for (s, e, t) in edits {
        let at = format!("{s}:{e}");
        match unique.get(&at) {
            Some(p) if p.2.len() >= t.len() => {}
            _ => {
                unique.insert(at, (s, e, t));
            }
        }
    }
    let mut by_module: indexmap::IndexMap<String, Vec<String>> = indexmap::IndexMap::new();
    for (m, imported, local) in added.values() {
        by_module
            .entry(m.clone())
            .or_default()
            .push(if local == imported { imported.clone() } else { format!("{imported} as {local}") });
    }
    let lines: Vec<String> = by_module.iter().map(|(m, n)| format!("import {{{}}} from '{m}';", n.join(", "))).collect();
    let ia = insert_at.unwrap_or(0);
    unique.insert("insert".into(), (ia, ia, format!("{}\n", lines.join("\n"))));
    let mut all: Vec<(usize, usize, String)> = unique.into_values().collect();
    all.sort_by(|a, b| b.0.cmp(&a.0).then(b.1.cmp(&a.1)));
    let mut out = source.to_string();
    for (s, e, t) in all {
        out = format!("{}{}{}", &out[..s], t, &out[e..]);
    }
    finish(&mut icons, mapped, kept);
    let _ = program.span();
    (out, Some(Value::Object(icons)))
}

/// `iconLines(icons)`: the icon report as text lines.
pub fn icon_lines(icons: Option<&Value>) -> Vec<String> {
    let Some(icons) = icons else { return Vec::new() };
    let status = vs(icons, "status").unwrap_or_default();
    if status != "selected" {
        if status == "none" {
            return Vec::new();
        }
        return vec![format!("icons: unchanged ({status}): {}", vs(icons, "reason").unwrap_or_default())];
    }
    let mut out = Vec::new();
    for m in arr(icons, "mapped") {
        let s = m.get("source").cloned().unwrap_or(Value::Null);
        let t = m.get("target").cloned().unwrap_or(Value::Null);
        let mut line = format!(
            "icons: mapped {} ({}) -> {} ({}) by {}",
            vs(&s, "export").unwrap_or_default(),
            vs(&s, "module").unwrap_or_default(),
            vs(&t, "export").unwrap_or_default(),
            vs(&t, "module").unwrap_or_default(),
            vs(m, "by").unwrap_or_default()
        );
        let d: Vec<String> = arr(m, "dropped").iter().filter_map(|x| x.as_str().map(String::from)).collect();
        if !d.is_empty() {
            line.push_str(&format!("; dropped {} (size comes from CSS)", d.join(", ")));
        }
        out.push(line);
    }
    for k in arr(icons, "kept") {
        let mut line = format!("icons: kept {}", vs(k, "export").unwrap_or_default());
        if let Some(m) = vs(k, "module") {
            line.push_str(&format!(" ({m})"));
        }
        line.push_str(&format!(": {}", vs(k, "reason").unwrap_or_default()));
        if let Some(s) = k.get("suggestion").filter(|s| s.is_object()) {
            line.push_str(&format!("; likely match: {} ({})", vs(s, "export").unwrap_or_default(), vs(s, "module").unwrap_or_default()));
        }
        out.push(line);
    }
    out
}
