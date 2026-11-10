//! Typed requests over the TypeScript 7 API channel.
//!
//! One method per wire request, with the payload keys in the order the Node
//! client writes them and `undefined` members left out, so the bytes on the
//! wire are the Node client's bytes. Responses are JSON values; `getSourceFile`
//! is the binary AST (see `ast`).

use super::channel::{Callback, Channel, ChannelError};
use serde_json::{json, Map, Value};

pub type Result<T> = std::result::Result<T, ChannelError>;

/// A symbol as the server describes it.
#[derive(Clone, Debug)]
pub struct Symbol(pub Value);
/// A type as the server describes it.
#[derive(Clone, Debug)]
pub struct Type(pub Value);
/// A signature as the server describes it.
#[derive(Clone, Debug)]
pub struct Signature(pub Value);

fn num(v: &Value, key: &str) -> u64 {
    v.get(key).and_then(|x| x.as_u64()).unwrap_or(0)
}

impl Symbol {
    pub fn id(&self) -> u64 {
        num(&self.0, "id")
    }
    pub fn name(&self) -> &str {
        self.0.get("name").and_then(|v| v.as_str()).unwrap_or("")
    }
    pub fn flags(&self) -> u64 {
        num(&self.0, "flags")
    }
    pub fn check_flags(&self) -> u64 {
        num(&self.0, "checkFlags")
    }
    /// Node handles (`index.kind.path`) of the declarations.
    pub fn declarations(&self) -> Vec<&str> {
        self.0.get("declarations").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|d| d.as_str()).collect()).unwrap_or_default()
    }
    pub fn value_declaration(&self) -> Option<&str> {
        self.0.get("valueDeclaration").and_then(|v| v.as_str())
    }
    pub fn parent(&self) -> Option<u64> {
        self.0.get("parent").and_then(|v| v.as_u64())
    }
    pub fn export_symbol(&self) -> Option<u64> {
        self.0.get("exportSymbol").and_then(|v| v.as_u64())
    }
}

impl Type {
    pub fn id(&self) -> u64 {
        num(&self.0, "id")
    }
    pub fn flags(&self) -> u64 {
        num(&self.0, "flags")
    }
    pub fn object_flags(&self) -> u64 {
        num(&self.0, "objectFlags")
    }
    pub fn symbol(&self) -> Option<u64> {
        self.0.get("symbol").and_then(|v| v.as_u64()).filter(|&s| s != 0)
    }
    pub fn alias_symbol(&self) -> Option<u64> {
        self.0.get("aliasSymbol").and_then(|v| v.as_u64()).filter(|&s| s != 0)
    }
    pub fn intrinsic_name(&self) -> Option<&str> {
        self.0.get("intrinsicName").and_then(|v| v.as_str())
    }
    pub fn value(&self) -> &Value {
        self.0.get("value").unwrap_or(&Value::Null)
    }
    pub fn get(&self, key: &str) -> Option<&Value> {
        self.0.get(key)
    }
}

impl Signature {
    pub fn id(&self) -> u64 {
        num(&self.0, "id")
    }
    pub fn flags(&self) -> u64 {
        num(&self.0, "flags")
    }
    pub fn declaration(&self) -> Option<&str> {
        self.0.get("declaration").and_then(|v| v.as_str())
    }
    pub fn parameters(&self) -> Vec<u64> {
        self.0.get("parameters").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|d| d.as_u64()).collect()).unwrap_or_default()
    }
}

/// A recorded exchange: method, request payload, response payload.
pub type Exchange = (String, Vec<u8>, Vec<u8>);

pub struct Client {
    channel: Channel,
    /// When set, every exchange is appended here (tests).
    pub record: Option<Vec<Exchange>>,
    pub current_directory: String,
}

/// The file system callbacks the server can delegate, in the Node order.
pub const FS_CALLBACK_NAMES: [&str; 5] = ["readFile", "fileExists", "directoryExists", "getAccessibleEntries", "realpath"];

impl Client {
    /// Spawn the server as the Node client does: `--api --cwd <cwd>`, plus
    /// `--callbacks=<names>` when file system callbacks are given.
    pub fn spawn(exe: &str, cwd: &str, callbacks: Vec<(&str, Callback)>) -> Result<Client> {
        let mut args = vec!["--api".to_string(), "--cwd".to_string(), cwd.to_string()];
        let mut enabled: Vec<(&str, Callback)> = Vec::new();
        let mut callbacks = callbacks;
        for name in FS_CALLBACK_NAMES {
            if let Some(i) = callbacks.iter().position(|(n, _)| *n == name) {
                enabled.push(callbacks.remove(i));
            }
        }
        if !enabled.is_empty() {
            args.push(format!("--callbacks={}", enabled.iter().map(|(n, _)| *n).collect::<Vec<_>>().join(",")));
        }
        let mut channel = Channel::spawn(exe, &args)?;
        for (name, cb) in enabled {
            channel.register_callback(name, cb);
        }
        Ok(Client { channel, record: None, current_directory: String::new() })
    }

    /// One raw exchange.
    pub fn raw(&mut self, method: &str, payload: &[u8]) -> Result<Vec<u8>> {
        let out = self.channel.request(method, payload);
        if cfg!(feature = "ts-timing") {
            let shown = |b: &[u8]| String::from_utf8_lossy(&b[..b.len().min(300)]).into_owned();
            match &out {
                Ok(o) => eprintln!("[ts7] {method} {} => {}", shown(payload), if method == "getSourceFile" { format!("{} bytes", o.len()) } else { shown(o) }),
                Err(e) => eprintln!("[ts7] {method} {} => ERROR {}", shown(payload), e.0),
            }
        }
        let out = out?;
        if let Some(rec) = self.record.as_mut() {
            rec.push((method.to_string(), payload.to_vec(), out.clone()));
        }
        Ok(out)
    }

    /// `apiRequest`: JSON in, JSON out (`None` for an empty response).
    pub fn request(&mut self, method: &str, params: &Value) -> Result<Option<Value>> {
        let payload = serde_json::to_vec(params).map_err(|e| ChannelError(e.to_string()))?;
        let out = self.raw(method, &payload)?;
        if out.is_empty() {
            return Ok(None);
        }
        serde_json::from_slice(&out).map(Some).map_err(|e| ChannelError(format!("{method}: {e}")))
    }

    /// `apiRequestBinary`: JSON in, bytes out (`None` for an empty response).
    pub fn request_binary(&mut self, method: &str, params: &Value) -> Result<Option<Vec<u8>>> {
        let payload = serde_json::to_vec(params).map_err(|e| ChannelError(e.to_string()))?;
        let out = self.raw(method, &payload)?;
        Ok(if out.is_empty() { None } else { Some(out) })
    }

    pub fn close(&mut self) {
        self.channel.close();
    }

    /// `initialize`.
    pub fn initialize(&mut self) -> Result<Value> {
        let v = self.request("initialize", &Value::Null)?.unwrap_or(Value::Null);
        self.current_directory = v.get("currentDirectory").and_then(|c| c.as_str()).unwrap_or("").to_string();
        Ok(v)
    }

    /// `updateSnapshot({ openProjects })`: the snapshot id and its projects.
    pub fn update_snapshot(&mut self, open_projects: &[&str]) -> Result<Value> {
        let v = self.request("updateSnapshot", &json!({ "openProjects": open_projects }))?;
        Ok(v.unwrap_or(Value::Null))
    }

    /// `updateSnapshot(params)` with any params object.
    pub fn update_snapshot_with(&mut self, params: &Value) -> Result<Value> {
        Ok(self.request("updateSnapshot", params)?.unwrap_or(Value::Null))
    }

    /// `release({ snapshot })`.
    pub fn release(&mut self, snapshot: u64) -> Result<()> {
        self.request("release", &json!({ "snapshot": snapshot }))?;
        Ok(())
    }

    pub fn parse_config_file(&mut self, file: &str) -> Result<Option<Value>> {
        self.request("parseConfigFile", &json!({ "file": file }))
    }

    pub fn get_default_project_for_file(&mut self, snapshot: u64, file: &str) -> Result<Option<Value>> {
        self.request("getDefaultProjectForFile", &json!({ "snapshot": snapshot, "file": file }))
    }
}

/// Requests scoped to one project of one snapshot.
pub struct Scope<'c> {
    pub client: &'c mut Client,
    pub snapshot: u64,
    pub project: String,
}

impl<'c> Scope<'c> {
    pub fn new(client: &'c mut Client, snapshot: u64, project: &str) -> Scope<'c> {
        Scope { client, snapshot, project: project.to_string() }
    }

    /// `{ snapshot, project, ...rest }`, `None` members left out.
    fn params(&self, rest: &[(&str, Option<Value>)]) -> Value {
        let mut m = Map::new();
        m.insert("snapshot".into(), json!(self.snapshot));
        m.insert("project".into(), json!(self.project));
        for (k, v) in rest {
            if let Some(v) = v {
                m.insert((*k).into(), v.clone());
            }
        }
        Value::Object(m)
    }

    pub fn call(&mut self, method: &str, rest: &[(&str, Option<Value>)]) -> Result<Option<Value>> {
        let p = self.params(rest);
        self.client.request(method, &p)
    }

    fn sym(&mut self, method: &str, rest: &[(&str, Option<Value>)]) -> Result<Option<Symbol>> {
        Ok(self.call(method, rest)?.filter(|v| !v.is_null()).map(Symbol))
    }
    fn ty(&mut self, method: &str, rest: &[(&str, Option<Value>)]) -> Result<Option<Type>> {
        Ok(self.call(method, rest)?.filter(|v| !v.is_null()).map(Type))
    }
    fn list<T>(&mut self, method: &str, rest: &[(&str, Option<Value>)], wrap: fn(Value) -> T) -> Result<Vec<T>> {
        Ok(match self.call(method, rest)? {
            Some(Value::Array(a)) => a.into_iter().map(wrap).collect(),
            _ => vec![],
        })
    }
    fn opt_list<T>(&mut self, method: &str, rest: &[(&str, Option<Value>)], wrap: fn(Value) -> T) -> Result<Vec<Option<T>>> {
        Ok(match self.call(method, rest)? {
            Some(Value::Array(a)) => a.into_iter().map(|v| if v.is_null() { None } else { Some(wrap(v)) }).collect(),
            _ => vec![],
        })
    }

    // ── Program ──
    pub fn get_source_file_names(&mut self) -> Result<Vec<String>> {
        Ok(match self.call("getSourceFileNames", &[])? {
            Some(Value::Array(a)) => a.into_iter().filter_map(|v| v.as_str().map(String::from)).collect(),
            _ => vec![],
        })
    }
    pub fn get_source_file(&mut self, file: &str) -> Result<Option<Vec<u8>>> {
        let p = self.params(&[("file", Some(json!(file)))]);
        self.client.request_binary("getSourceFile", &p)
    }
    pub fn get_source_file_metadata(&mut self, file: &str) -> Result<Option<Value>> {
        self.call("getSourceFileMetadata", &[("file", Some(json!(file)))])
    }
    /// `get<Kind>Diagnostics(file?)`; kind is `Syntactic`, `Semantic`, ...
    pub fn diagnostics(&mut self, kind: &str, file: Option<&str>) -> Result<Vec<Value>> {
        let method = format!("get{kind}Diagnostics");
        self.list(&method, &[("file", file.map(|f| json!(f)))], |v| v)
    }

    // ── Checker: symbols ──
    pub fn get_symbol_at_location(&mut self, node: &str) -> Result<Option<Symbol>> {
        self.sym("getSymbolAtLocation", &[("location", Some(json!(node)))])
    }
    pub fn get_symbols_at_locations(&mut self, nodes: &[&str]) -> Result<Vec<Option<Symbol>>> {
        self.opt_list("getSymbolsAtLocations", &[("locations", Some(json!(nodes)))], Symbol)
    }
    pub fn get_symbol_at_position(&mut self, file: &str, position: u64) -> Result<Option<Symbol>> {
        self.sym("getSymbolAtPosition", &[("file", Some(json!(file))), ("position", Some(json!(position)))])
    }
    pub fn get_symbols_at_positions(&mut self, file: &str, positions: &[u64]) -> Result<Vec<Option<Symbol>>> {
        self.opt_list("getSymbolsAtPositions", &[("file", Some(json!(file))), ("positions", Some(json!(positions)))], Symbol)
    }
    pub fn get_aliased_symbol(&mut self, symbol: u64) -> Result<Option<Symbol>> {
        self.sym("getAliasedSymbol", &[("symbol", Some(json!(symbol)))])
    }
    pub fn get_immediate_aliased_symbol(&mut self, symbol: u64) -> Result<Option<Symbol>> {
        self.sym("getImmediateAliasedSymbol", &[("symbol", Some(json!(symbol)))])
    }
    pub fn get_exports_of_module(&mut self, symbol: u64) -> Result<Vec<Symbol>> {
        self.list("getExportsOfModule", &[("symbol", Some(json!(symbol)))], Symbol)
    }
    pub fn get_member_in_module_exports(&mut self, symbol: u64, name: &str) -> Result<Option<Symbol>> {
        self.sym("getMemberInModuleExports", &[("symbol", Some(json!(symbol))), ("name", Some(json!(name)))])
    }
    pub fn get_properties_of_type(&mut self, ty: u64) -> Result<Vec<Symbol>> {
        self.list("getPropertiesOfType", &[("type", Some(json!(ty)))], Symbol)
    }
    pub fn get_property_of_type(&mut self, ty: u64, name: &str) -> Result<Option<Symbol>> {
        self.sym("getPropertyOfType", &[("type", Some(json!(ty))), ("name", Some(json!(name)))])
    }
    pub fn resolve_name(&mut self, name: &str, meaning: u64, location: Option<Value>, exclude_globals: Option<bool>) -> Result<Option<Symbol>> {
        self.sym(
            "resolveName",
            &[("name", Some(json!(name))), ("meaning", Some(json!(meaning))), ("location", location), ("excludeGlobals", exclude_globals.map(|b| json!(b)))],
        )
    }
    pub fn get_documentation_comment(&mut self, symbol: u64) -> Result<String> {
        Ok(self.call("getDocumentationComment", &[("symbol", Some(json!(symbol)))])?.and_then(|v| v.as_str().map(String::from)).unwrap_or_default())
    }
    pub fn get_js_doc_tags(&mut self, symbol: u64) -> Result<Vec<Value>> {
        self.list("getJsDocTags", &[("symbol", Some(json!(symbol)))], |v| v)
    }
    /// A symbol's members or exports table (`getMembersOfSymbol`, `getExportsOfSymbol`).
    pub fn symbol_table(&mut self, method: &str, symbol: u64) -> Result<Vec<Symbol>> {
        self.list(method, &[("objectId", Some(json!(symbol)))], Symbol)
    }
    /// A related object by id (`getParentOfSymbol`, `getTargetOfType`, ...).
    pub fn fetch(&mut self, method: &str, object_id: u64) -> Result<Option<Value>> {
        self.call(method, &[("objectId", Some(json!(object_id)))])
    }

    // ── Checker: types ──
    pub fn get_type_of_symbol(&mut self, symbol: u64) -> Result<Option<Type>> {
        self.ty("getTypeOfSymbol", &[("symbol", Some(json!(symbol)))])
    }
    pub fn get_types_of_symbols(&mut self, symbols: &[u64]) -> Result<Vec<Option<Type>>> {
        self.opt_list("getTypesOfSymbols", &[("symbols", Some(json!(symbols)))], Type)
    }
    pub fn get_declared_type_of_symbol(&mut self, symbol: u64) -> Result<Option<Type>> {
        self.ty("getDeclaredTypeOfSymbol", &[("symbol", Some(json!(symbol)))])
    }
    pub fn get_type_of_symbol_at_location(&mut self, symbol: u64, node: &str) -> Result<Option<Type>> {
        self.ty("getTypeOfSymbolAtLocation", &[("symbol", Some(json!(symbol))), ("location", Some(json!(node)))])
    }
    pub fn get_type_at_location(&mut self, node: &str) -> Result<Option<Type>> {
        self.ty("getTypeAtLocation", &[("location", Some(json!(node)))])
    }
    pub fn get_type_at_locations(&mut self, nodes: &[&str]) -> Result<Vec<Option<Type>>> {
        self.opt_list("getTypeAtLocations", &[("locations", Some(json!(nodes)))], Type)
    }
    pub fn get_type_at_position(&mut self, file: &str, position: u64) -> Result<Option<Type>> {
        self.ty("getTypeAtPosition", &[("file", Some(json!(file))), ("position", Some(json!(position)))])
    }
    pub fn get_type_from_type_node(&mut self, node: &str) -> Result<Option<Type>> {
        self.ty("getTypeFromTypeNode", &[("location", Some(json!(node)))])
    }
    pub fn get_contextual_type(&mut self, node: &str) -> Result<Option<Type>> {
        self.ty("getContextualType", &[("location", Some(json!(node)))])
    }
    /// A type-to-type request keyed by `type` (`getApparentType`,
    /// `getNonNullableType`, `getBaseTypeOfLiteralType`, `getWidenedType`,
    /// `getBaseConstraintOfType`, `getConstraintOfTypeParameter`).
    pub fn type_op(&mut self, method: &str, ty: u64) -> Result<Option<Type>> {
        self.ty(method, &[("type", Some(json!(ty)))])
    }
    pub fn types_op(&mut self, method: &str, ty: u64) -> Result<Vec<Type>> {
        self.list(method, &[("type", Some(json!(ty)))], Type)
    }
    /// Related types by object id (`getTypesOfType`, `getTypeArguments`, ...).
    pub fn fetch_types(&mut self, method: &str, object_id: u64) -> Result<Vec<Type>> {
        self.list(method, &[("objectId", Some(json!(object_id)))], Type)
    }
    pub fn get_type_arguments(&mut self, ty: u64) -> Result<Vec<Type>> {
        self.list("getTypeArguments", &[("type", Some(json!(ty)))], Type)
    }
    pub fn get_base_types(&mut self, ty: u64) -> Result<Vec<Type>> {
        self.list("getBaseTypes", &[("type", Some(json!(ty)))], Type)
    }
    pub fn get_index_infos_of_type(&mut self, ty: u64) -> Result<Vec<Value>> {
        self.list("getIndexInfosOfType", &[("type", Some(json!(ty)))], |v| v)
    }
    pub fn type_to_string(&mut self, ty: u64, location: Option<&str>, flags: Option<u64>) -> Result<String> {
        let v = self.call("typeToString", &[("type", Some(json!(ty))), ("location", location.map(|l| json!(l))), ("flags", flags.map(|f| json!(f)))])?;
        Ok(v.and_then(|v| v.as_str().map(String::from)).unwrap_or_default())
    }
    pub fn is_type_assignable_to(&mut self, source: u64, target: u64) -> Result<bool> {
        Ok(self.call("isTypeAssignableTo", &[("source", Some(json!(source))), ("target", Some(json!(target)))])?.and_then(|v| v.as_bool()).unwrap_or(false))
    }
    /// A boolean test keyed by `type` (`isArrayType`, `isTupleType`, `isArrayLikeType`).
    pub fn type_test(&mut self, method: &str, ty: u64) -> Result<bool> {
        Ok(self.call(method, &[("type", Some(json!(ty)))])?.and_then(|v| v.as_bool()).unwrap_or(false))
    }
    /// An intrinsic type (`getStringType`, `getAnyType`, ...).
    pub fn intrinsic(&mut self, method: &str) -> Result<Option<Type>> {
        self.ty(method, &[])
    }

    // ── Checker: signatures ──
    pub fn get_signatures_of_type(&mut self, ty: u64, kind: u64) -> Result<Vec<Signature>> {
        self.list("getSignaturesOfType", &[("type", Some(json!(ty))), ("kind", Some(json!(kind)))], Signature)
    }
    pub fn get_resolved_signature(&mut self, node: &str) -> Result<Option<Signature>> {
        Ok(self.call("getResolvedSignature", &[("location", Some(json!(node)))])?.filter(|v| !v.is_null()).map(Signature))
    }
    pub fn get_return_type_of_signature(&mut self, signature: u64) -> Result<Option<Type>> {
        self.ty("getReturnTypeOfSignature", &[("signature", Some(json!(signature)))])
    }
    pub fn get_rest_type_of_signature(&mut self, signature: u64) -> Result<Option<Type>> {
        self.ty("getRestTypeOfSignature", &[("signature", Some(json!(signature)))])
    }
    pub fn get_parameter_type(&mut self, signature: u64, index: u64) -> Result<Option<Type>> {
        self.ty("getParameterType", &[("signature", Some(json!(signature))), ("index", Some(json!(index)))])
    }
}
