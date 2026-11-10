//! The type checks' view of TypeScript: this CLI's own TypeScript 7, read
//! through its API (`crate::ts7`), under the names of TypeScript's JavaScript
//! compiler API that the checks were written against, as
//! `foundation/discovery/typescript-checker.mjs` and the syntax facade of
//! `project-typescript.mjs` give them. Every check's logic is Rust; values
//! are dynamic (`JsValue`) so each module reads as its JS original.

pub mod doc_types;
pub mod package_tsconfig;
pub mod prop_compare;
pub mod prop_drift;
pub mod prop_origin;
pub mod prop_read;
pub mod prop_types;
pub mod type_match;
pub mod type_text;
pub mod unresolved;

use crate::ts7::session::{Project, Session};
use crate::ts7::syntax::V;
use crate::ts7::syntax_tables as tables;
use serde_json::Value as Json;
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

/// What to do when the project installs no TypeScript.
pub const TYPESCRIPT_FIX: &str = "Install TypeScript in this project (`npm install -D typescript`), then run this check again.";

/// A value as the JS checks see it.
#[derive(Clone, Debug, Default)]
pub enum JsValue {
    #[default]
    Undefined,
    Null,
    Bool(bool),
    Num(f64),
    Str(Rc<str>),
    /// A syntax node or node list.
    Node(V),
    /// A symbol, type or signature, by its index in the registry.
    Sym(u32),
    Type(u32),
    Sig(u32),
    Arr(Rc<Vec<JsValue>>),
    Obj(Rc<RefCell<Vec<(String, JsValue)>>>),
    Checker,
    Program,
}

impl JsValue {
    pub fn undefined() -> JsValue {
        JsValue::Undefined
    }
    pub fn is_undefined(&self) -> bool {
        matches!(self, JsValue::Undefined) || matches!(self, JsValue::Node(V::Undef))
    }
    pub fn is_null(&self) -> bool {
        matches!(self, JsValue::Null)
    }
    pub fn to_boolean(&self) -> bool {
        match self {
            JsValue::Undefined | JsValue::Null => false,
            JsValue::Bool(b) => *b,
            JsValue::Num(n) => *n != 0.0 && !n.is_nan(),
            JsValue::Str(s) => !s.is_empty(),
            JsValue::Node(v) => !v.is_undefined(),
            _ => true,
        }
    }
    pub fn as_number(&self) -> Option<f64> {
        match self {
            JsValue::Num(n) => Some(*n),
            _ => None,
        }
    }
    pub fn as_boolean(&self) -> Option<bool> {
        match self {
            JsValue::Bool(b) => Some(*b),
            _ => None,
        }
    }
    pub fn as_str(&self) -> Option<&str> {
        match self {
            JsValue::Str(s) => Some(s),
            _ => None,
        }
    }
    pub fn is_string(&self) -> bool {
        matches!(self, JsValue::Str(_))
    }
    pub fn node(&self) -> V {
        match self {
            JsValue::Node(v) => *v,
            _ => V::Undef,
        }
    }
}

impl From<bool> for JsValue {
    fn from(b: bool) -> JsValue {
        JsValue::Bool(b)
    }
}
impl From<f64> for JsValue {
    fn from(n: f64) -> JsValue {
        JsValue::Num(n)
    }
}
impl From<V> for JsValue {
    fn from(v: V) -> JsValue {
        if v.is_undefined() {
            JsValue::Undefined
        } else {
            JsValue::Node(v)
        }
    }
}

/// `JSON.parse` of an API response, as JS values.
pub fn from_json(v: &Json) -> JsValue {
    match v {
        Json::Null => JsValue::Null,
        Json::Bool(b) => JsValue::Bool(*b),
        Json::Number(n) => JsValue::Num(n.as_f64().unwrap_or(f64::NAN)),
        Json::String(s) => JsValue::Str(s.as_str().into()),
        Json::Array(a) => JsValue::Arr(Rc::new(a.iter().map(from_json).collect())),
        Json::Object(o) => JsValue::Obj(Rc::new(RefCell::new(o.iter().map(|(k, v)| (k.clone(), from_json(v))).collect()))),
    }
}

#[derive(Default)]
struct SymRec {
    raw: Json,
    declarations: Option<JsValue>,
    value_declaration: Option<JsValue>,
}

#[derive(Default)]
struct TypeRec {
    raw: Json,
    cache: HashMap<&'static str, JsValue>,
}

/// The session and the adapted project.
pub struct Ts {
    pub s: Session,
    pub version: String,
    project: Option<Project>,
    syms: Vec<SymRec>,
    sym_ids: HashMap<u64, u32>,
    types: Vec<TypeRec>,
    type_ids: HashMap<u64, u32>,
    sigs: Vec<Json>,
    sig_ids: HashMap<u64, u32>,
    /// The program's compiler options, with `configFilePath`.
    pub compiler_options: JsValue,
}

/// `resolveProjectTypeScript(dirs)`: the project's own TypeScript version.
pub fn project_typescript(dirs: &[&str]) -> Option<String> {
    crate::ts7::session::project_typescript_version(dirs)
}

/// Run `f` on a session of this CLI's TypeScript 7 in `cwd`; `Err` is the
/// reason it could not start.
pub fn with_session<R>(cwd: &str, f: impl FnOnce(&mut Ts) -> R) -> Result<R, String> {
    let s = Session::open(cwd)?;
    let version = s.version.clone();
    let mut t = Ts {
        s,
        version,
        project: None,
        syms: vec![],
        sym_ids: HashMap::new(),
        types: vec![],
        type_ids: HashMap::new(),
        sigs: vec![],
        sig_ids: HashMap::new(),
        compiler_options: JsValue::Undefined,
    };
    let r = f(&mut t);
    t.s.close();
    Ok(r)
}

fn jnum(v: &Json, key: &str) -> u64 {
    v.get(key).and_then(|x| x.as_u64()).unwrap_or(0)
}

fn flag(group: &str, name: &str) -> u64 {
    tables::enum_value(group, name).unwrap_or(0.0) as u64
}

impl Ts {
    /// `adaptProject(project)`: the checker and program read `project`.
    pub fn adapt(&mut self, project: Project) {
        self.project = Some(project);
        self.syms.clear();
        self.sym_ids.clear();
        self.types.clear();
        self.type_ids.clear();
        self.sigs.clear();
        self.sig_ids.clear();
    }

    pub fn project(&self) -> &Project {
        self.project.as_ref().expect("an adapted project")
    }

    fn call_api(&mut self, method: &str, rest: &[(&str, Option<Json>)]) -> Option<Json> {
        let p = self.project.clone()?;
        self.s.scope(&p).call(method, rest).ok().flatten().filter(|v| !v.is_null())
    }

    fn sym(&mut self, raw: Option<Json>) -> JsValue {
        let Some(raw) = raw.filter(|r| r.is_object()) else { return JsValue::Undefined };
        let id = jnum(&raw, "id");
        if let Some(i) = self.sym_ids.get(&id) {
            return JsValue::Sym(*i);
        }
        let i = self.syms.len() as u32;
        self.syms.push(SymRec { raw, ..Default::default() });
        self.sym_ids.insert(id, i);
        JsValue::Sym(i)
    }

    fn ty(&mut self, raw: Option<Json>) -> JsValue {
        let Some(raw) = raw.filter(|r| r.is_object()) else { return JsValue::Undefined };
        let id = jnum(&raw, "id");
        if let Some(i) = self.type_ids.get(&id) {
            return JsValue::Type(*i);
        }
        let i = self.types.len() as u32;
        self.types.push(TypeRec { raw, cache: HashMap::new() });
        self.type_ids.insert(id, i);
        JsValue::Type(i)
    }

    fn sig(&mut self, raw: Json) -> JsValue {
        let id = jnum(&raw, "id");
        if let Some(i) = self.sig_ids.get(&id) {
            return JsValue::Sig(*i);
        }
        let i = self.sigs.len() as u32;
        self.sigs.push(raw);
        self.sig_ids.insert(id, i);
        JsValue::Sig(i)
    }

    fn list(&mut self, raw: Option<Json>, wrap: fn(&mut Ts, Option<Json>) -> JsValue) -> JsValue {
        let items = match raw {
            Some(Json::Array(a)) => a.into_iter().map(|x| wrap(self, Some(x))).collect(),
            _ => vec![],
        };
        JsValue::Arr(Rc::new(items))
    }

    fn sym_id(&self, v: &JsValue) -> Option<Json> {
        match v {
            JsValue::Sym(i) => Some(Json::from(jnum(&self.syms[*i as usize].raw, "id"))),
            _ => None,
        }
    }
    fn type_id(&self, v: &JsValue) -> Option<Json> {
        match v {
            JsValue::Type(i) => Some(Json::from(jnum(&self.types[*i as usize].raw, "id"))),
            _ => None,
        }
    }
    fn handle(&self, v: &JsValue) -> Option<Json> {
        match v {
            JsValue::Node(n) if !n.is_undefined() => Some(Json::from(self.s.syntax.handle(n))),
            _ => None,
        }
    }

    /// `NodeHandle.resolve(project)`.
    pub fn resolve_handle(&mut self, handle: &str) -> JsValue {
        let mut it = handle.splitn(3, '.');
        let (Some(index), Some(_), Some(path)) = (it.next(), it.next(), it.next()) else { return JsValue::Undefined };
        let Ok(index) = index.parse::<u32>() else { return JsValue::Undefined };
        let Some(p) = self.project.clone() else { return JsValue::Undefined };
        let sf = self.s.source_file(&p, path);
        match sf.file() {
            Some(f) => JsValue::Node(V::Node(f, index)),
            None => JsValue::Undefined,
        }
    }

    fn handles(&mut self, raw: Option<&Json>) -> JsValue {
        let hs: Vec<String> = raw.and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|h| h.as_str().map(String::from)).collect()).unwrap_or_default();
        let nodes: Vec<JsValue> = hs.iter().map(|h| self.resolve_handle(h)).filter(|n| !n.is_undefined()).collect();
        JsValue::Arr(Rc::new(nodes))
    }

    // ── Property access ──

    /// `v[key]`.
    pub fn get(&mut self, v: &JsValue, key: &str) -> JsValue {
        match v {
            JsValue::Node(n) => self.node_get(n, key),
            JsValue::Sym(i) => self.sym_get(*i, key),
            JsValue::Type(i) => self.type_get(*i, key),
            JsValue::Sig(i) => {
                let raw = self.sigs[*i as usize].clone();
                raw.get(key).map(from_json).unwrap_or_default()
            }
            JsValue::Obj(o) => o.borrow().iter().find(|(k, _)| k == key).map(|(_, v)| v.clone()).unwrap_or_default(),
            JsValue::Arr(a) => {
                if key == "length" {
                    JsValue::Num(a.len() as f64)
                } else {
                    key.parse::<usize>().ok().and_then(|i| a.get(i).cloned()).unwrap_or_default()
                }
            }
            JsValue::Str(s) if key == "length" => JsValue::Num(s.encode_utf16().count() as f64),
            _ => JsValue::Undefined,
        }
    }

    pub fn get_i(&mut self, v: &JsValue, i: usize) -> JsValue {
        match v {
            JsValue::Node(n @ V::List(..)) => self.s.syntax.items(n).get(i).copied().map(JsValue::from).unwrap_or_default(),
            JsValue::Arr(a) => a.get(i).cloned().unwrap_or_default(),
            _ => JsValue::Undefined,
        }
    }

    pub fn set(&mut self, v: &JsValue, key: &str, value: JsValue) {
        if let JsValue::Obj(o) = v {
            let mut o = o.borrow_mut();
            match o.iter_mut().find(|(k, _)| k == key) {
                Some(e) => e.1 = value,
                None => o.push((key.to_string(), value)),
            }
        }
    }

    fn node_get(&mut self, n: &V, key: &str) -> JsValue {
        let syn = &self.s.syntax;
        if let V::List(..) = n {
            return match key {
                "length" => JsValue::Num(syn.len(n) as f64),
                "pos" => JsValue::Num(syn.pos(n) as f64),
                "end" => JsValue::Num(syn.end(n) as f64),
                _ => key.parse::<usize>().ok().and_then(|i| syn.items(n).get(i).copied()).map(JsValue::from).unwrap_or_default(),
            };
        }
        if n.is_undefined() {
            return JsValue::Undefined;
        }
        if tables::child_properties(syn.kind(n)).contains(&key) {
            return syn.get(n, key).into();
        }
        let is_sf = syn.is("isSourceFile", n);
        match key {
            "kind" => JsValue::Num(syn.kind(n) as f64),
            "pos" => JsValue::Num(syn.pos(n) as f64),
            "end" => JsValue::Num(syn.end(n) as f64),
            "flags" => JsValue::Num(syn.flags(n) as f64),
            "parent" => syn.parent(n).into(),
            "text" => match syn.text_opt(n) {
                Some(t) => JsValue::Str(t.into()),
                None => JsValue::Undefined,
            },
            "fileName" if is_sf => JsValue::Str(syn.file_name(n).into()),
            "path" if is_sf => JsValue::Str(syn.path(n).into()),
            "isDeclarationFile" if is_sf => JsValue::Bool(syn.flags(n) & flag("NodeFlags", "Ambient") as u32 != 0),
            "externalModuleIndicator" if is_sf => match syn.external_module_indicator(n) {
                None => JsValue::Undefined,
                Some(V::Undef) => JsValue::Bool(true),
                Some(v) => JsValue::Node(v),
            },
            "isExportEquals" | "isTypeOnly" | "isTypeOf" | "multiLine" | "isArrayType" | "isBracketed" | "isNameFirst" | "containsOnlyTriviaWhiteSpaces" => {
                JsValue::Bool(syn.flag(n, key))
            }
            "operator" => syn.operator(n).map(|k| JsValue::Num(k as f64)).unwrap_or_default(),
            "token" => syn.token(n).map(|k| JsValue::Num(k as f64)).unwrap_or_default(),
            "keyword" => syn.keyword(n).map(|k| JsValue::Num(k as f64)).unwrap_or_default(),
            "imports" if is_sf => JsValue::Arr(Rc::new(syn.imports(n).into_iter().map(JsValue::from).collect())),
            "moduleAugmentations" if is_sf => JsValue::Arr(Rc::new(syn.module_augmentations(n).into_iter().map(JsValue::from).collect())),
            "referencedFiles" | "typeReferenceDirectives" | "libReferenceDirectives" if is_sf => {
                let refs = match key {
                    "referencedFiles" => syn.referenced_files(n),
                    "typeReferenceDirectives" => syn.type_reference_directives(n),
                    _ => syn.lib_reference_directives(n),
                };
                let items = refs
                    .into_iter()
                    .map(|r| {
                        self.obj(vec![
                            ("pos", JsValue::Num(r.pos as f64)),
                            ("end", JsValue::Num(r.end as f64)),
                            ("fileName", JsValue::Str(r.file_name.into())),
                            ("resolutionMode", JsValue::Num(r.resolution_mode as f64)),
                            ("preserve", JsValue::Bool(r.preserve)),
                        ])
                    })
                    .collect();
                JsValue::Arr(Rc::new(items))
            }
            "jsDoc" => {
                let d = syn.jsdoc(n);
                if d.is_empty() {
                    JsValue::Undefined
                } else {
                    JsValue::Arr(Rc::new(d.into_iter().map(JsValue::from).collect()))
                }
            }
            _ => JsValue::Undefined,
        }
    }

    fn sym_get(&mut self, i: u32, key: &str) -> JsValue {
        let raw = self.syms[i as usize].raw.clone();
        match key {
            "name" | "escapedName" => raw.get("name").map(from_json).unwrap_or_default(),
            "flags" | "checkFlags" => raw.get(key).map(from_json).unwrap_or(JsValue::Num(0.0)),
            "declarations" => {
                if let Some(d) = &self.syms[i as usize].declarations {
                    return d.clone();
                }
                let d = self.handles(raw.get("declarations"));
                self.syms[i as usize].declarations = Some(d.clone());
                d
            }
            "valueDeclaration" => {
                if let Some(d) = &self.syms[i as usize].value_declaration {
                    return d.clone();
                }
                let d = match raw.get("valueDeclaration").and_then(|h| h.as_str()) {
                    Some(h) => {
                        let h = h.to_string();
                        self.resolve_handle(&h)
                    }
                    None => JsValue::Undefined,
                };
                self.syms[i as usize].value_declaration = Some(d.clone());
                d
            }
            "parent" => {
                if raw.get("parent").and_then(|p| p.as_u64()).unwrap_or(0) == 0 {
                    return JsValue::Undefined;
                }
                let id = jnum(&raw, "id");
                let r = self.call_api("getParentOfSymbol", &[("objectId", Some(Json::from(id)))]);
                self.sym(r)
            }
            _ => JsValue::Undefined,
        }
    }

    fn type_get(&mut self, i: u32, key: &str) -> JsValue {
        let raw = self.types[i as usize].raw.clone();
        let flags = jnum(&raw, "flags");
        let object_flags = jnum(&raw, "objectFlags");
        let tf = |n: &str| flag("TypeFlags", n);
        let of = |n: &str| flag("ObjectFlags", n);
        match key {
            "id" => raw.get("id").map(from_json).unwrap_or_default(),
            "flags" => JsValue::Num(flags as f64),
            "objectFlags" => JsValue::Num(object_flags as f64),
            "value" => {
                if flags & (tf("Literal") | tf("EnumLiteral")) != 0 {
                    raw.get("value").map(from_json).unwrap_or_default()
                } else {
                    JsValue::Undefined
                }
            }
            "intrinsicName" => match raw.get("intrinsicName").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
                Some(s) => JsValue::Str(s.into()),
                None if flags & tf("BooleanLiteral") != 0 => {
                    JsValue::Str(if raw.get("value").and_then(|v| v.as_bool()).unwrap_or(false) { "true" } else { "false" }.into())
                }
                None => JsValue::Undefined,
            },
            "texts" => raw.get("texts").filter(|t| !t.is_null()).map(from_json).unwrap_or_default(),
            _ => {
                let k: &'static str = match key {
                    "types" => "types",
                    "symbol" => "symbol",
                    "aliasSymbol" => "aliasSymbol",
                    "aliasTypeArguments" => "aliasTypeArguments",
                    "target" => "target",
                    "type" => "type",
                    "declaration" => "declaration",
                    _ => return JsValue::Undefined,
                };
                if let Some(v) = self.types[i as usize].cache.get(k) {
                    return v.clone();
                }
                let id = Some(Json::from(jnum(&raw, "id")));
                let has = |f: &str| raw.get(f).and_then(|v| v.as_u64()).unwrap_or(0) != 0;
                let value = match k {
                    "types" => {
                        if flags & (tf("Union") | tf("Intersection") | tf("TemplateLiteral")) != 0 {
                            let r = self.call_api("getTypesOfType", &[("objectId", id)]);
                            self.list(r, Ts::ty)
                        } else {
                            JsValue::Undefined
                        }
                    }
                    "symbol" if has("symbol") => {
                        let r = self.call_api("getSymbolOfType", &[("objectId", id)]);
                        self.sym(r)
                    }
                    "aliasSymbol" if has("aliasSymbol") => {
                        let r = self.call_api("getAliasSymbolOfType", &[("objectId", id)]);
                        self.sym(r)
                    }
                    "aliasTypeArguments" if raw.get("aliasTypeArguments").and_then(|a| a.as_array()).map(|a| !a.is_empty()).unwrap_or(false) => {
                        let r = self.call_api("getAliasTypeArgumentsOfType", &[("objectId", id)]);
                        self.list(r, Ts::ty)
                    }
                    "target" if object_flags & of("Reference") != 0 && has("target") => {
                        let r = self.call_api("getTargetOfType", &[("objectId", id)]);
                        self.ty(r)
                    }
                    "type" if flags & tf("StringMapping") != 0 && has("target") => {
                        let r = self.call_api("getTargetOfType", &[("objectId", id)]);
                        self.ty(r)
                    }
                    "declaration" if object_flags & of("Mapped") != 0 => {
                        let s = self.get(&JsValue::Type(i), "symbol");
                        let decls = self.get(&s, "declarations");
                        self.items(&decls).into_iter().find(|d| self.is("isMappedTypeNode", d)).unwrap_or_default()
                    }
                    _ => JsValue::Undefined,
                };
                self.types[i as usize].cache.insert(k, value.clone());
                value
            }
        }
    }

    // ── Methods ──

    /// `v[method](...args)`; `Err` when it has no such method.
    pub fn call(&mut self, v: &JsValue, method: &str, args: &[JsValue]) -> Result<JsValue, JsValue> {
        let a = |i: usize| args.get(i).cloned().unwrap_or_default();
        Ok(match v {
            JsValue::Checker => self.checker_call(method, args)?,
            JsValue::Program => self.program_call(method, args)?,
            JsValue::Type(i) => {
                let raw = self.types[*i as usize].raw.clone();
                let flags = jnum(&raw, "flags");
                let tf = |n: &str| flag("TypeFlags", n);
                match method {
                    "isUnion" => JsValue::Bool(flags & tf("Union") != 0),
                    "isIntersection" => JsValue::Bool(flags & tf("Intersection") != 0),
                    "isStringLiteral" => JsValue::Bool(flags & tf("StringLiteral") != 0),
                    "isNumberLiteral" => JsValue::Bool(flags & tf("NumberLiteral") != 0),
                    "getCallSignatures" | "getConstructSignatures" => {
                        let kind = if method == "getCallSignatures" { 0 } else { 1 };
                        let r = self.call_api("getSignaturesOfType", &[("type", Some(Json::from(jnum(&raw, "id")))), ("kind", Some(Json::from(kind)))]);
                        let items = match r {
                            Some(Json::Array(arr)) => arr.into_iter().map(|s| self.sig(s)).collect(),
                            _ => vec![],
                        };
                        JsValue::Arr(Rc::new(items))
                    }
                    _ => return Err(JsValue::Undefined),
                }
            }
            JsValue::Sig(i) => {
                let raw = self.sigs[*i as usize].clone();
                let id = Some(Json::from(jnum(&raw, "id")));
                match method {
                    "getParameters" => {
                        let r = self.call_api("getParametersOfSignature", &[("objectId", id)]);
                        self.list(r, Ts::sym)
                    }
                    "getTypeParameters" => {
                        if raw.get("typeParameters").and_then(|a| a.as_array()).map(|a| !a.is_empty()).unwrap_or(false) {
                            let r = self.call_api("getTypeParametersOfSignature", &[("objectId", id)]);
                            self.list(r, Ts::ty)
                        } else {
                            JsValue::Arr(Rc::new(vec![]))
                        }
                    }
                    _ => return Err(JsValue::Undefined),
                }
            }
            JsValue::Node(n) => match method {
                "getStart" => JsValue::Num(self.s.syntax.start(n) as f64),
                "getEnd" => JsValue::Num(self.s.syntax.end(n) as f64),
                "getText" => JsValue::Str(self.s.syntax.get_text(n).into()),
                "getFullText" => {
                    let t = self.s.syntax.text16(n);
                    let (p, e) = (self.s.syntax.pos(n).max(0) as usize, self.s.syntax.end(n).max(0) as usize);
                    JsValue::Str(String::from_utf16_lossy(&t[p.min(t.len())..e.min(t.len())]).into())
                }
                "getSourceFile" => self.s.syntax.source_file(n).into(),
                "getLineAndCharacterOfPosition" => {
                    let pos = a(0).as_number().unwrap_or(0.0) as usize;
                    let (line, character) = self.s.syntax.line_and_character(n, pos);
                    self.obj(vec![("line", JsValue::Num(line as f64)), ("character", JsValue::Num(character as f64))])
                }
                _ => return Err(JsValue::Undefined),
            },
            _ => return Err(JsValue::Undefined),
        })
    }

    fn checker_call(&mut self, method: &str, args: &[JsValue]) -> Result<JsValue, JsValue> {
        let a = |i: usize| args.get(i).cloned().unwrap_or_default();
        Ok(match method {
            "getSymbolAtLocation" | "getShorthandAssignmentValueSymbol" => {
                let Some(h) = self.handle(&a(0)) else { return Ok(JsValue::Undefined) };
                let r = self.call_api(method, &[("location", Some(h))]);
                self.sym(r)
            }
            "getExportsOfModule" => {
                let s = self.sym_id(&a(0));
                let r = self.call_api("getExportsOfModule", &[("symbol", s)]);
                self.list(r, Ts::sym)
            }
            "getAliasedSymbol" => {
                let s = self.sym_id(&a(0));
                let r = self.call_api("getAliasedSymbol", &[("symbol", s)]);
                self.sym(r)
            }
            "getExportSymbolOfSymbol" => {
                let JsValue::Sym(i) = a(0) else { return Ok(JsValue::Undefined) };
                let raw = self.syms[i as usize].raw.clone();
                let es = raw.get("exportSymbol").and_then(|v| v.as_u64()).unwrap_or(0);
                if es == 0 {
                    return Ok(JsValue::Sym(i));
                }
                if let Some(j) = self.sym_ids.get(&es) {
                    return Ok(JsValue::Sym(*j));
                }
                let r = self.call_api("getExportSymbolOfSymbol", &[("objectId", Some(Json::from(jnum(&raw, "id"))))]);
                self.sym(r)
            }
            "getTypeOfSymbolAtLocation" => {
                let (s, h) = (self.sym_id(&a(0)), self.handle(&a(1)));
                let r = self.call_api(method, &[("symbol", s), ("location", h)]);
                self.ty(r)
            }
            "getTypeOfSymbol" | "getDeclaredTypeOfSymbol" => {
                let s = self.sym_id(&a(0));
                let r = self.call_api(method, &[("symbol", s)]);
                self.ty(r)
            }
            "getPropertiesOfType" => {
                let t = self.type_id(&a(0));
                let r = self.call_api(method, &[("type", t)]);
                self.list(r, Ts::sym)
            }
            "getPropertyOfType" => {
                let t = self.type_id(&a(0));
                let name = a(1).as_str().map(|s| Json::from(s.to_string()));
                let r = self.call_api(method, &[("type", t), ("name", name)]);
                self.sym(r)
            }
            "getIndexInfosOfType" => {
                let t = self.type_id(&a(0));
                let r = self.call_api(method, &[("type", t)]);
                let infos = match r {
                    Some(Json::Array(arr)) => arr,
                    _ => vec![],
                };
                let mut out = Vec::new();
                for info in infos {
                    let key_type = self.ty(info.get("keyType").cloned());
                    let value_type = self.ty(info.get("valueType").cloned());
                    let declaration = match info.get("declaration").and_then(|d| d.as_str()) {
                        Some(h) => {
                            let h = h.to_string();
                            self.resolve_handle(&h)
                        }
                        None => JsValue::Undefined,
                    };
                    out.push(self.obj(vec![("keyType", key_type), ("type", value_type), ("declaration", declaration)]));
                }
                JsValue::Arr(Rc::new(out))
            }
            "typeToString" => {
                let t = self.type_id(&a(0));
                let h = self.handle(&a(1));
                let flags = a(2).as_number().map(|f| Json::from(f as u64));
                let r = self.call_api(method, &[("type", t), ("location", h), ("flags", flags)]);
                JsValue::Str(r.and_then(|v| v.as_str().map(String::from)).unwrap_or_default().into())
            }
            "getTypeFromTypeNode" | "getTypeAtLocation" => {
                let Some(h) = self.handle(&a(0)) else { return Ok(JsValue::Undefined) };
                let r = self.call_api(method, &[("location", Some(h))]);
                self.ty(r)
            }
            "isTypeAssignableTo" => {
                let (s, t) = (self.type_id(&a(0)), self.type_id(&a(1)));
                JsValue::Bool(self.call_api(method, &[("source", s), ("target", t)]).and_then(|v| v.as_bool()).unwrap_or(false))
            }
            "getUndefinedType" => {
                let r = self.call_api(method, &[]);
                self.ty(r)
            }
            "getTypeArguments" | "getBaseTypes" => {
                let t = self.type_id(&a(0));
                let r = self.call_api(method, &[("type", t)]);
                self.list(r, Ts::ty)
            }
            "resolveName" => {
                let name = a(0).as_str().map(|s| Json::from(s.to_string()));
                let meaning = a(1).as_number().map(|m| Json::from(m as u64));
                let h = self.handle(&a(2));
                let r = self.call_api(method, &[("name", name), ("meaning", meaning), ("location", h), ("excludeGlobals", Some(Json::from(false)))]);
                self.sym(r)
            }
            "getFullyQualifiedName" => {
                let mut parts: Vec<String> = Vec::new();
                let mut at = a(0);
                while let JsValue::Sym(_) = at {
                    let n = self.get(&at, "name");
                    parts.insert(0, self.s_of(&n));
                    at = self.get(&at, "parent");
                }
                JsValue::Str(parts.join(".").into())
            }
            _ => return Err(JsValue::Undefined),
        })
    }

    fn program_call(&mut self, method: &str, args: &[JsValue]) -> Result<JsValue, JsValue> {
        let a = |i: usize| args.get(i).cloned().unwrap_or_default();
        Ok(match method {
            "getTypeChecker" => JsValue::Checker,
            "getCompilerOptions" => self.compiler_options.clone(),
            "getSourceFile" => {
                let file = self.s_of(&a(0));
                let p = self.project().clone();
                self.s.source_file(&p, &file).into()
            }
            "getSourceFileNames" => {
                let p = self.project().clone();
                let names = self.s.scope(&p).get_source_file_names().unwrap_or_default();
                JsValue::Arr(Rc::new(names.into_iter().map(|n| JsValue::Str(n.into())).collect()))
            }
            "isSourceFileDefaultLibrary" => {
                let sf = a(0).node();
                let path = self.s.syntax.path(&sf).to_string();
                let p = self.project().clone();
                let meta = self.s.scope(&p).get_source_file_metadata(&path).ok().flatten();
                JsValue::Bool(meta.and_then(|m| m.get("isDefaultLibrary").and_then(|v| v.as_bool())).unwrap_or(false))
            }
            "getSemanticDiagnostics" => {
                let file = match a(0) {
                    JsValue::Str(s) => s.to_string(),
                    JsValue::Node(n) => self.s.syntax.file_name(&n),
                    _ => String::new(),
                };
                let p = self.project().clone();
                let ds = self.s.diagnostics(&p, "Semantic", &file);
                let items = ds
                    .iter()
                    .map(|d| {
                        let g = |k: &str| d.get(k).map(from_json).unwrap_or_default();
                        self.obj(vec![("start", g("pos")), ("end", g("end")), ("code", g("code")), ("category", g("category")), ("messageText", g("text"))])
                    })
                    .collect();
                JsValue::Arr(Rc::new(items))
            }
            _ => return Err(JsValue::Undefined),
        })
    }

    /// `v[method](...args)`, `undefined` when it has none.
    pub fn m(&mut self, v: &JsValue, method: &str, args: &[JsValue]) -> JsValue {
        self.call(v, method, args).unwrap_or_default()
    }

    /// `ts[name](...args)`: the syntax helpers.
    pub fn f(&mut self, name: &str, args: &[JsValue]) -> JsValue {
        let a = |i: usize| args.get(i).cloned().unwrap_or_default();
        match name {
            "createSourceFile" => {
                let (file, text) = (self.s_of(&a(0)), self.s_of(&a(1)));
                self.s.create_source_file(&file, &text).into()
            }
            "getJSDocTags" => {
                let n = a(0).node();
                JsValue::Arr(Rc::new(self.s.syntax.jsdoc_tags(&n).into_iter().map(JsValue::from).collect()))
            }
            "isExternalModule" => {
                let sf = a(0).node();
                JsValue::Bool(self.s.syntax.external_module_indicator(&sf).is_some())
            }
            "getLeadingCommentRanges" => {
                let text: Vec<u16> = self.s_of(&a(0)).encode_utf16().collect();
                let pos = a(1).as_number().unwrap_or(0.0) as i64;
                let rs = crate::ts7::syntax::leading_comment_ranges(&text, pos);
                if rs.is_empty() {
                    return JsValue::Undefined;
                }
                let items = rs
                    .iter()
                    .map(|r| {
                        self.obj(vec![
                            ("kind", JsValue::Num(r.kind as f64)),
                            ("pos", JsValue::Num(r.pos as f64)),
                            ("end", JsValue::Num(r.end as f64)),
                            ("hasTrailingNewLine", JsValue::Bool(r.has_trailing_new_line)),
                        ])
                    })
                    .collect();
                JsValue::Arr(Rc::new(items))
            }
            _ => {
                debug_assert!(false, "no syntax helper {name}");
                JsValue::Undefined
            }
        }
    }

    /// `syntax.prefetchSourceFiles(entries)`.
    pub fn prefetch(&mut self, entries: &[(String, String)]) {
        self.s.parse(entries);
    }

    /// `syntax.parseDiagnosticsOf(sf)`'s length.
    pub fn parse_diagnostics_count(&self, sf: &JsValue) -> usize {
        self.s.parse_diagnostics_of(&sf.node()).len()
    }

    /// `ts[name](node)`: a node test.
    pub fn is(&mut self, name: &str, node: &JsValue) -> bool {
        match node {
            JsValue::Node(n @ V::Node(..)) => self.s.syntax.is(name, n),
            _ => false,
        }
    }

    /// `ts[group][name]`.
    pub fn enum_value(&mut self, group: &str, name: &str) -> f64 {
        tables::enum_value(group, name).unwrap_or(f64::NAN)
    }

    pub fn kind(&mut self, node: &JsValue) -> f64 {
        match node {
            JsValue::Node(n) if !n.is_undefined() => self.s.syntax.kind(n) as f64,
            _ => f64::NAN,
        }
    }

    fn s_of(&self, v: &JsValue) -> String {
        match v {
            JsValue::Str(s) => s.to_string(),
            JsValue::Num(n) => crate::json::js_number_to_string(*n),
            JsValue::Bool(b) => b.to_string(),
            JsValue::Undefined | JsValue::Null => String::new(),
            _ => String::new(),
        }
    }

    /// `String(v)` (`""` for nullish).
    pub fn s(&mut self, v: &JsValue) -> String {
        self.s_of(v)
    }
    pub fn opt_s(&mut self, v: &JsValue) -> Option<String> {
        v.as_str().map(String::from)
    }
    pub fn n(&mut self, v: &JsValue) -> f64 {
        v.as_number().unwrap_or(f64::NAN)
    }
    pub fn items(&mut self, v: &JsValue) -> Vec<JsValue> {
        match v {
            JsValue::Node(n @ V::List(..)) => self.s.syntax.items(n).into_iter().map(JsValue::from).collect(),
            JsValue::Arr(a) => a.as_ref().clone(),
            _ => vec![],
        }
    }
    pub fn str(&self, s: &str) -> JsValue {
        JsValue::Str(s.into())
    }
    pub fn num(&self, n: f64) -> JsValue {
        JsValue::Num(n)
    }
    pub fn arr(&mut self, items: Vec<JsValue>) -> JsValue {
        JsValue::Arr(Rc::new(items))
    }
    pub fn obj(&self, props: Vec<(&str, JsValue)>) -> JsValue {
        JsValue::Obj(Rc::new(RefCell::new(props.into_iter().map(|(k, v)| (k.to_string(), v)).collect())))
    }
    /// `Object.assign({}, ...parts)`.
    pub fn assign(&mut self, parts: Vec<JsValue>) -> JsValue {
        let out = self.obj(vec![]);
        for p in parts {
            if let JsValue::Obj(o) = p {
                for (k, v) in o.borrow().iter() {
                    self.set(&out, k, v.clone());
                }
            }
        }
        out
    }
    /// `node.getStart(sf)`.
    pub fn start(&mut self, node: &JsValue, _sf: &JsValue) -> f64 {
        match node {
            JsValue::Node(n) if !n.is_undefined() => self.s.syntax.start(n) as f64,
            _ => f64::NAN,
        }
    }
    pub fn end(&mut self, node: &JsValue) -> f64 {
        match node {
            JsValue::Node(n) if !n.is_undefined() => self.s.syntax.end(n) as f64,
            _ => f64::NAN,
        }
    }
    /// The children `forEachChild` visits, in order.
    pub fn children(&mut self, node: &JsValue) -> Vec<JsValue> {
        match node {
            JsValue::Node(n) => self.s.syntax.children(n).into_iter().map(JsValue::from).collect(),
            _ => vec![],
        }
    }
    /// `a === b` for objects.
    pub fn same(&self, a: &JsValue, b: &JsValue) -> bool {
        match (a, b) {
            (JsValue::Node(x), JsValue::Node(y)) => x == y && !x.is_undefined(),
            (JsValue::Sym(x), JsValue::Sym(y)) | (JsValue::Type(x), JsValue::Type(y)) | (JsValue::Sig(x), JsValue::Sig(y)) => x == y,
            (JsValue::Arr(x), JsValue::Arr(y)) => Rc::ptr_eq(x, y),
            (JsValue::Obj(x), JsValue::Obj(y)) => Rc::ptr_eq(x, y),
            (JsValue::Checker, JsValue::Checker) | (JsValue::Program, JsValue::Program) => true,
            _ => false,
        }
    }
    pub fn truthy(&self, v: &JsValue) -> bool {
        v.to_boolean()
    }
}
