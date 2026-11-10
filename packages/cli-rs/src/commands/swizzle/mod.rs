//! `astryx swizzle`: port of clients/cli/commands/swizzle.mjs and
//! api/swizzle. Copies a component's source into the project.

pub mod copy;
pub mod exports;
pub mod graph;
pub mod jspath;
pub mod module_info;
pub mod path_safety;

use crate::cli::command::{CmdResult, ErrorOpts, Invocation, Out};
use crate::cli::format::{list, record, section, text, Field};
use crate::json::{Map, Value};

pub const WARN: &str = "!";

fn cwd_of(inv: &Invocation) -> String {
    inv.cwd.to_string_lossy().into_owned()
}

/// `swizzle(component, options)`: the list or copy response.
pub fn swizzle_api(component: Option<&str>, list: bool, opts: &copy::CopyOptions) -> Result<Value, copy::ApiError> {
    match component {
        Some(c) if !c.is_empty() && !list => copy::swizzle_copy(c, opts),
        _ => {
            let (_, comps) = copy::resolve_core(&opts.cwd)?;
            let mut m = Map::new();
            m.insert("type".into(), Value::String("swizzle.list".into()));
            m.insert("package".into(), Value::String(copy::CORE_PACKAGE.into()));
            m.insert("data".into(), Value::Array(comps.into_iter().map(Value::String).collect()));
            Ok(Value::Object(m))
        }
    }
}

pub fn run(inv: &Invocation, out: &mut Out) -> CmdResult {
    let component = inv.arg(0);
    let list_flag = inv.flag("list");
    if !list_flag {
        if let Some("") = component {
            return out.cli_error(
                "Argument <component> is an empty string. An empty argument is not the same as an omitted one, and ignoring it would silently discard the rest of the command: pass a value, or leave <component> out of `astryx swizzle` entirely.",
                ErrorOpts::code("ERR_INVALID_ARGUMENT"),
            );
        }
    }
    let cwd = cwd_of(inv);
    let run = crate::discovery::package_manager::get_cli_invocation(Some(&cwd));
    let opts = copy::CopyOptions {
        cwd: cwd.clone(),
        output: inv.opt_str("output").unwrap_or("./components/astryx").to_string(),
        package: inv.opt_str("package").map(String::from),
        overwrite: inv.flag("overwrite"),
    };
    let result = match swizzle_api(component, list_flag, &opts) {
        Ok(r) => r,
        Err(e) => return out.cli_error(&e.message, ErrorOpts::code(&e.code).suggestions(e.suggestions)),
    };
    if inv.json() {
        out.json_out_response(&result);
        return Ok(());
    }
    let kind = result["type"].as_str().unwrap_or("");
    if kind == "swizzle.list" {
        let comps: Vec<String> = result["data"].as_array().unwrap().iter().map(|v| v.as_str().unwrap_or("").to_string()).collect();
        out.emit(&[
            record(&[("package".to_string(), Field::Str(result["package"].as_str().unwrap_or("").into()))]),
            section("Available components", None),
            list(&comps),
            text(&format!("Usage: {run} swizzle <component>")),
            text(&format!("Example: {run} swizzle Button\n         {run} swizzle XDSButton  (XDS prefix also works)")),
        ]);
        return Ok(());
    }
    let data = &result["data"];
    let owner = data["package"].as_str().unwrap_or("");
    let mut blocks = vec![
        text(&format!("[ok] Copied {} files to {}/", crate::cli::format::js_string(&data["filesCopied"]), data["outputDir"].as_str().unwrap_or(""))),
        text(&format!(
            "What {owner} exports is imported from {owner}; the internal modules the component needs are copied beside it.\nYou can now customize the component source freely."
        )),
    ];
    let shared: Vec<String> = data["files"].as_array().map(|a| a.iter().filter_map(|v| v.as_str()).filter(|f| f.starts_with("../")).map(String::from).collect()).unwrap_or_default();
    if !shared.is_empty() {
        blocks.push(text(&format!("Copied beside it: {} (in the package's folder layout; imported by relative path)", shared.join(", "))));
    }
    if let Some(deps) = data["dependencies"].as_object() {
        if !deps.is_empty() {
            let parts: Vec<String> = deps
                .iter()
                .map(|(n, r)| {
                    let r = r.as_str().unwrap_or("");
                    if r == "*" {
                        n.clone()
                    } else {
                        format!("{n}@\"{r}\"")
                    }
                })
                .collect();
            blocks.push(text(&format!("It imports these npm packages; install any your project lacks: {}", parts.join(" "))));
        }
    }
    if let Some(marker) = data.get("marker").filter(|m| m.is_object()) {
        let mpath = marker["path"].as_str().unwrap_or("");
        let folder = {
            let re = regress::Regex::new(r"\/?astryx-swizzle\.json$").unwrap();
            let f = match re.find(mpath) {
                Some(m) => format!("{}{}", &mpath[..m.start()], &mpath[m.end()..]),
                None => mpath.to_string(),
            };
            if f.is_empty() {
                ".".to_string()
            } else {
                f
            }
        };
        if marker["written"].as_bool().unwrap_or(false) {
            blocks.push(text(&format!("Marked {folder}/ with astryx-swizzle.json: with @astryxdesign/build's Babel, PostCSS and Vite integrations, or withAstryx() under webpack, every module under it compiles below your theme, so theme overrides reach the copy. Keep only swizzled copies there. Turbopack does not read the marker yet.")));
        } else {
            let found: Vec<String> = marker["found"].as_array().map(|a| a.iter().map(crate::cli::format::js_string).collect()).unwrap_or_default();
            blocks.push(text(&format!("Did not mark {folder}/ with astryx-swizzle.json: it already holds {} and no astryx-swizzle.json. If it holds only swizzled copies, add {mpath} to mark it, so theme overrides reach them; keep the product's own components out of a marked folder.", found.join(", "))));
        }
    }
    if data["usesStyleX"].as_bool().unwrap_or(false) {
        blocks.push(text(&[
            format!("{WARN} These components use StyleX and require a StyleX compiler in your build."),
            "  Without one, importing them throws \"Unexpected 'stylex.create' call at runtime\"".to_string(),
            "  and the page does not render. See setup per framework:".to_string(),
            format!("  {run} docs styling"),
            "  Next.js note: the StyleX Babel plugin disables SWC and breaks next/font -".to_string(),
            "  use an SWC-based StyleX transform instead (covered in the guide).".to_string(),
        ]
        .join("\n")));
    }
    if let Some(fb) = data.get("feedback").filter(|f| f.is_object()) {
        let line = fb.get("ghCommand").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).or_else(|| fb.get("issuesUrl").and_then(|v| v.as_str())).unwrap_or("");
        blocks.push(text(&format!("Customizing a component often signals a gap in the design system.\nLet the maintainers know what you needed:\n  {line}")));
    }
    out.emit(&blocks);
    Ok(())
}
