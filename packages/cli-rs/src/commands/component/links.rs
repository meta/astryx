//! Doc links in component reads: each inline `{@link <target>}` in a
//! component doc's text resolves to the command that opens the doc it
//! names (`linkComponentResponse` in `api/component/_adapter.mjs`).

use super::api::Response;
use std::path::Path;

/// `linkComponentResponse(response, cwd)`.
pub fn link_component_response(response: Response, cwd: &Path) -> Response {
    let _ = cwd;
    if !matches!(response.kind.as_str(), "component.detail" | "component.detail.props" | "component.list") {
        return response;
    }
    if !crate::json::stringify(&response.data, 0).contains("{@") {
        return response;
    }
    // TEMP: the docs catalog link pass lands next.
    response
}
