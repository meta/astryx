//! Port of `foundation/discovery/package-tsconfig.mjs`: the compiler options
//! and ambient declarations a package's own TypeScript config gives.

use super::Ts;
use crate::discovery::nodepath as np;
use boa_engine::JsValue;

pub struct PackageConfig {
    pub options: JsValue,
    pub error: Option<String>,
    pub declarations: Vec<String>,
}

fn read_ambient(t: &mut Ts, file: &str) -> bool {
    let Ok(text) = std::fs::read_to_string(file) else { return false };
    if crate::doctor_re!(r"\bdeclare\s+(?:global|module)\b").find(&text).is_some() {
        return true;
    }
    if crate::doctor_re!(r"\.tsx?$").find(file).is_none() {
        return false;
    }
    if crate::doctor_re!(r"\b(?:import|export)\b").find(&text).is_none() {
        return true;
    }
    let latest = t.enum_value("ScriptTarget", "Latest");
    let (f, tx) = (t.str(file), t.str(&text));
    let sf = t.f("createSourceFile", &[f, tx, JsValue::from(latest)]);
    !t.f("isExternalModule", &[sf]).to_boolean()
}

fn is_ambient(t: &mut Ts, file: &str) -> bool {
    if crate::doctor_re!(r"\.d\.[cm]?ts$").find(file).is_some() {
        return true;
    }
    if !np::exists(file) {
        return false;
    }
    read_ambient(t, file)
}

fn diag_text(t: &mut Ts, d: &JsValue) -> String {
    let mt = t.get(d, "messageText");
    let sp = t.str(" ");
    let v = t.f("flattenDiagnosticMessageText", &[mt, sp]);
    t.s(&v)
}

/// Parse one config; `error` set on the returned object as in the JS.
fn parse(t: &mut Ts, config_path: &str, package_dir: &str) -> (JsValue, Option<String>) {
    let ts: JsValue = t.ts.clone().into();
    let sys = t.get(&ts, "sys");
    let read_file = t.get(&sys, "readFile");
    let cp = t.str(config_path);
    let read = t.f("readConfigFile", &[cp.clone(), read_file]);
    let read_error = t.get(&read, "error");
    let config = if !read_error.is_undefined() && !read_error.is_null() {
        let errs = t.arr(vec![read_error.clone()]);
        let fns = t.arr(vec![]);
        let opts = t.obj(vec![]);
        t.obj(vec![("errors", errs), ("fileNames", fns), ("options", opts)])
    } else {
        let rc = t.get(&read, "config");
        let dir = t.str(&np::dirname(config_path));
        t.f("parseJsonConfigFileContent", &[rc, sys.clone(), dir, JsValue::undefined(), cp.clone()])
    };
    let errors = t.get(&config, "errors");
    let problem = t.items(&errors).into_iter().find(|d| {
        let c = t.get(d, "code");
        t.n(&c) != 18003.0
    });
    let where_ = np::relative(package_dir, config_path);
    let mut error = None;
    if let Some(p) = problem {
        error = Some(format!("{where_}: {}", diag_text(t, &p)));
    } else if read_error.is_undefined() || read_error.is_null() {
        let rc = t.get(&read, "config");
        if let Some(missing) = read_files_entries(t, &rc, config_path, &config) {
            let dir = np::dirname(config_path);
            let rel = np::relative(package_dir, &dir);
            let with = if rel.is_empty() { String::new() } else { format!("{rel}/") };
            error = Some(format!("{where_}: {}", missing.split(&format!("{dir}/")).collect::<Vec<_>>().join(&with)));
        }
    }
    (config, error)
}

fn read_files_entries(t: &mut Ts, raw: &JsValue, config_path: &str, config: &JsValue) -> Option<String> {
    let ts: JsValue = t.ts.clone().into();
    let sys = t.get(&ts, "sys");
    let empty = t.func((), |_, _, _, ctx| Ok(boa_engine::object::builtins::JsArray::new(ctx)?.into()));
    let over = t.obj(vec![("readDirectory", empty)]);
    let host = t.assign(vec![sys, over]);
    let dir = t.str(&np::dirname(config_path));
    let cp = t.str(config_path);
    let parsed = t.f("parseJsonConfigFileContent", &[raw.clone(), host, dir, JsValue::undefined(), cp]);
    let literal = t.get(&parsed, "fileNames");
    let lit = t.items(&literal);
    if lit.is_empty() {
        return None;
    }
    let opts = t.get(config, "options");
    let types = t.arr(vec![]);
    let over = t.obj(vec![("noLib", JsValue::from(true)), ("noResolve", JsValue::from(true)), ("types", types), ("noEmit", JsValue::from(true))]);
    let options = t.assign(vec![opts, over]);
    let args = t.obj(vec![("rootNames", literal.clone()), ("options", options)]);
    let program = t.f("createProgram", &[args]);
    let diags = t.m(&program, "getOptionsDiagnostics", &[]);
    let missing = t.items(&diags).into_iter().find(|d| {
        let c = t.get(d, "code");
        let c = t.n(&c);
        c == 6053.0 || c == 6231.0
    });
    if let Some(m) = missing {
        let text = t.get(&m, "messageText");
        if let Some(s) = t.opt_s(&text) {
            return Some(s);
        }
        let inner = t.get(&text, "messageText");
        return Some(t.s(&inner));
    }
    let entries: Vec<String> = lit.iter().map(|f| np::resolve1(&t.s(f))).collect();
    let fns = t.get(config, "fileNames");
    let mut kept: Vec<JsValue> = Vec::new();
    for f in t.items(&fns) {
        let s = t.s(&f);
        if !entries.contains(&np::resolve1(&s)) {
            kept.push(f);
        }
    }
    let sfs = t.m(&program, "getSourceFiles", &[]);
    for sf in t.items(&sfs) {
        kept.push(t.get(&sf, "fileName"));
    }
    let arr = t.arr(kept);
    t.set(config, "fileNames", arr);
    None
}

/// `readPackageTsconfig(ts, packageDir, sources)`.
pub fn read_package_tsconfig(t: &mut Ts, package_dir: &str, sources: &[String]) -> PackageConfig {
    let e = |t: &mut Ts, g: &str, n: &str| JsValue::from(t.enum_value(g, n));
    let (jsx, target, module, res) = (e(t, "JsxEmit", "ReactJSX"), e(t, "ScriptTarget", "ES2022"), e(t, "ModuleKind", "ESNext"), e(t, "ModuleResolutionKind", "Bundler"));
    let defaults = t.obj(vec![
        ("jsx", jsx.clone()),
        ("target", target),
        ("module", module),
        ("moduleResolution", res),
        ("strict", JsValue::from(true)),
        ("allowJs", JsValue::from(true)),
        ("esModuleInterop", JsValue::from(true)),
        ("resolveJsonModule", JsValue::from(true)),
        ("allowImportingTsExtensions", JsValue::from(true)),
    ]);
    let ts: JsValue = t.ts.clone().into();
    let sys = t.get(&ts, "sys");
    let fe = t.get(&sys, "fileExists");
    let (pd, name) = (t.str(package_dir), t.str("tsconfig.json"));
    let found = t.f("findConfigFile", &[pd, fe, name]);
    let found = t.opt_s(&found);
    let installed = found.as_ref().map(|f| np::relative(&np::dirname(f), package_dir).split('/').any(|s| s == "node_modules")).unwrap_or(false);
    let mut parsed: Option<(JsValue, Option<String>)> = match &found {
        Some(f) if !installed => Some(parse(t, f, package_dir)),
        _ => None,
    };
    let own: Vec<String> = sources.iter().map(|f| np::resolve1(f)).collect();
    let mut visited: Vec<String> = found.iter().map(|f| np::resolve1(f)).collect();
    let mut broken: Option<(JsValue, Option<String>)> = None;
    fn including(
        t: &mut Ts,
        config: (JsValue, Option<String>),
        own: &[String],
        visited: &mut Vec<String>,
        broken: &mut Option<(JsValue, Option<String>)>,
        package_dir: &str,
    ) -> Option<(JsValue, Option<String>)> {
        let fns = t.get(&config.0, "fileNames");
        if t.items(&fns).iter().any(|f| own.contains(&np::resolve1(&t.s(f)))) {
            return Some(config);
        }
        let refs = t.get(&config.0, "projectReferences");
        for r in t.items(&refs) {
            let p = t.f("resolveProjectReferencePath", &[r]);
            let next = np::resolve1(&t.s(&p));
            if visited.contains(&next) {
                continue;
            }
            visited.push(next.clone());
            let referenced = parse(t, &next, package_dir);
            if referenced.1.is_some() && broken.is_none() {
                *broken = Some(referenced.clone());
            }
            if let Some(hit) = including(t, referenced, own, visited, broken, package_dir) {
                return Some(hit);
            }
        }
        None
    }
    if let Some(p) = parsed.clone() {
        parsed = Some(including(t, p.clone(), &own, &mut visited, &mut broken, package_dir).or(broken.clone()).unwrap_or(p));
    }
    let error = parsed.as_ref().and_then(|p| p.1.clone());
    let options = match &parsed {
        Some((c, _)) => {
            let o = t.get(c, "options");
            t.assign(vec![o])
        }
        None => defaults.clone(),
    };
    let j = t.get(&options, "jsx");
    if j.is_undefined() || j.is_null() {
        t.set(&options, "jsx", jsx);
    }
    let over = t.obj(vec![("noEmit", JsValue::from(true)), ("skipLibCheck", JsValue::from(true)), ("incremental", JsValue::from(false)), ("composite", JsValue::from(false))]);
    let options = t.assign(vec![options, over]);
    let mut declarations = Vec::new();
    if let Some((c, _)) = &parsed {
        let fns = t.get(c, "fileNames");
        for f in t.items(&fns) {
            let s = t.s(&f);
            if is_ambient(t, &s) {
                declarations.push(s);
            }
        }
    }
    PackageConfig { options, error, declarations }
}
