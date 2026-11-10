//! Doc links in component reads: each inline `{@link <target>}` in a
//! component doc's text resolves to the command that opens the doc it
//! names (`linkComponentResponse` in `api/component/_adapter.mjs`).

use super::api::Response;
use super::deps;
use crate::discovery::component_discovery::CORE_PACKAGE;
use crate::discovery::doc_compiler::links::link_fields;
use crate::json::{Map, Value};
use std::path::Path;

const CLI_PROVIDER_ID: &str = "@astryxdesign/cli";
const LINK_KINDS: &[&str] = &["generic", "command", "function", "schema", "enum", "namespace", "component", "template", "theme"];

/// `componentLinkProvider(ownerPackage, providerId)`.
pub fn component_link_provider(owner: &str, provider_id: Option<&str>) -> String {
    if owner == CORE_PACKAGE {
        CLI_PROVIDER_ID.into()
    } else {
        provider_id.unwrap_or(owner).to_string()
    }
}

/// `linkComponentResponse(response, cwd)`.
pub fn link_component_response(response: Response, cwd: &Path) -> Response {
    if !matches!(response.kind.as_str(), "component.detail" | "component.detail.props" | "component.list") {
        return response;
    }
    if !crate::json::stringify(&response.data, 0).contains("{@") {
        return response;
    }
    let finder = crate::commands::docs::link_resolver(&cwd.to_string_lossy());
    let declared: Vec<(String, String)> = deps::load_integrations_safely(cwd)
        .into_iter()
        .filter_map(|i| i.provider_id.clone().map(|p| (i.name.clone(), p)))
        .collect();
    let link = |doc: &Value, owner: Option<&str>| -> Value {
        let Some(owner) = owner else { return doc.clone() };
        if !crate::json::stringify(doc, 0).contains("{@") {
            return doc.clone();
        }
        let pid = declared.iter().find(|(n, _)| n == owner).map(|(_, p)| p.as_str());
        let provider = component_link_provider(owner, pid);
        let mut f = |t: &str| finder.resolve(t, &provider);
        link_fields(doc, &mut f).0
    };
    if response.kind != "component.list" {
        let data = link(&response.data, response.package.as_deref());
        return Response { data, ..response };
    }
    let mut comps = Map::new();
    if let Some(groups) = response.data.get("components").and_then(|c| c.as_object()) {
        for (g, entries) in groups {
            let linked: Vec<Value> = super::jsv::arr(Some(entries)).iter().map(|e| link(e, e.get("package").and_then(|p| p.as_str()))).collect();
            comps.insert(g.clone(), Value::Array(linked));
        }
    }
    let mut data = response.data.as_object().cloned().unwrap_or_default();
    data.insert("components".into(), Value::Object(comps));
    Response { data: Value::Object(data), ..response }
}
