//! `astryx blog` (clients/cli/commands/blog.mjs over api/blog): reads the
//! published RSS feed; with a slug, that post's plaintext body.

use crate::cli::command::{CmdResult, ErrorOpts, Invocation, Out, Suggestion};
use crate::cli::format::{code, record, records, section, text, Field, Fields};
use crate::json::{Map, Value};

const SITE_URL: &str = "https://astryx.atmeta.com";
const FEED_URL: &str = "https://astryx.atmeta.com/rss.xml";
const FETCH_TIMEOUT_MS: u64 = 15000;
const MAX_BYTES: usize = 5 * 1024 * 1024;

const POST_FIELDS: &[&str] = &["slug", "title", "description", "date", "type", "authors", "link", "textUrl"];

struct BlogError {
    message: String,
    suggestions: Vec<Suggestion>,
    code: &'static str,
}

fn fetch_err(message: String) -> BlogError {
    BlogError { message, suggestions: vec![], code: "ERR_FETCH_FAILED" }
}

/// `fetch(url)` as Node's fetch does it: no proxy from the environment,
/// redirects followed, the whole read bounded by the timeout.
fn fetch_text(url: &str) -> Result<String, BlogError> {
    let agent = ureq::AgentBuilder::new().timeout(std::time::Duration::from_millis(FETCH_TIMEOUT_MS)).redirects(20).build();
    let res = match agent.get(url).call() {
        Ok(r) => r,
        Err(ureq::Error::Status(status, _)) => return Err(fetch_err(format!("Request to {url} failed with {status}"))),
        Err(ureq::Error::Transport(t)) => {
            let timed_out = t.kind() == ureq::ErrorKind::Io && t.to_string().to_lowercase().contains("timed out");
            let reason = if timed_out { "timed out" } else { "fetch failed" };
            return Err(fetch_err(format!("Could not reach {url}: {reason}")));
        }
    };
    let mut reader = res.into_reader().take((MAX_BYTES + 1) as u64);
    let mut buf = Vec::new();
    use std::io::Read;
    if let Err(e) = reader.read_to_end(&mut buf) {
        let reason = if e.kind() == std::io::ErrorKind::TimedOut || e.kind() == std::io::ErrorKind::WouldBlock { "timed out".to_string() } else { "terminated".to_string() };
        return Err(fetch_err(format!("Could not reach {url}: {reason}")));
    }
    if buf.len() > MAX_BYTES {
        return Err(fetch_err(format!("Response from {url} exceeded {MAX_BYTES} bytes")));
    }
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

fn unescape_xml(v: &str) -> String {
    v.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&")
}

fn js_trim(s: &str) -> &str {
    s.trim_matches(crate::cli::format::js_ws)
}

/// Every `<name[^>]*>([\s\S]*?)</name>` match, in order.
fn tag_all(item: &str, name: &str) -> Vec<String> {
    let open = format!("<{name}");
    let close = format!("</{name}>");
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(i) = item[from..].find(&open) {
        let start = from + i;
        let after = start + open.len();
        let Some(gt) = item[after..].find('>') else { break };
        let body_start = after + gt + 1;
        match item[body_start..].find(&close) {
            Some(j) => {
                out.push(unescape_xml(js_trim(&item[body_start..body_start + j])));
                from = body_start + j + close.len();
            }
            None => from = start + 1,
        }
    }
    out
}

fn tag(item: &str, name: &str) -> String {
    let open = format!("<{name}");
    let close = format!("</{name}>");
    let mut from = 0;
    while let Some(i) = item[from..].find(&open) {
        let start = from + i;
        let after = start + open.len();
        let Some(gt) = item[after..].find('>') else { return String::new() };
        let body_start = after + gt + 1;
        if let Some(j) = item[body_start..].find(&close) {
            return unescape_xml(js_trim(&item[body_start..body_start + j]));
        }
        from = start + 1;
    }
    String::new()
}

fn re(pattern: &str) -> regress::Regex {
    regress::Regex::new(pattern).expect("valid regex")
}

fn text_href(item: &str) -> Option<String> {
    let el_re = re(r"<atom:link\b[^>]*?\/?>");
    let rel = re(r#"rel\s*=\s*["']alternate["']"#);
    let ty = re(r#"type\s*=\s*["']text\/plain["']"#);
    let href = re(r#"href\s*=\s*["']([^"']+)["']"#);
    for m in el_re.find_iter(item) {
        let el = &item[m.range()];
        if rel.find(el).is_some() && ty.find(el).is_some() {
            if let Some(h) = href.find(el) {
                if let Some(g) = h.group(1) {
                    return Some(unescape_xml(&el[g]));
                }
            }
        }
    }
    None
}

fn slug_from_link(link: &str) -> String {
    match url::Url::parse(link) {
        Ok(u) => {
            let path = u.path();
            let path = path.strip_suffix('/').unwrap_or(path);
            path[path.rfind('/').map(|i| i + 1).unwrap_or(0)..].to_string()
        }
        Err(_) => link.to_string(),
    }
}

fn parse_feed(xml: &str) -> Vec<Value> {
    let mut items = Vec::new();
    let mut from = 0;
    while let Some(i) = xml[from..].find("<item>") {
        let start = from + i + 6;
        let Some(j) = xml[start..].find("</item>") else { break };
        let raw = &xml[start..start + j];
        from = start + j + 7;
        let link = tag(raw, "link");
        let mut m = Map::new();
        m.insert("slug".into(), Value::from(slug_from_link(&link)));
        m.insert("title".into(), Value::from(tag(raw, "title")));
        m.insert("description".into(), Value::from(tag(raw, "description")));
        m.insert("date".into(), Value::from(tag(raw, "pubDate")));
        m.insert("type".into(), Value::from(tag(raw, "category")));
        m.insert("authors".into(), Value::Array(tag_all(raw, "author").into_iter().map(Value::from).collect()));
        m.insert("link".into(), Value::from(link));
        m.insert("textUrl".into(), text_href(raw).map(Value::from).unwrap_or(Value::Null));
        items.push(Value::Object(m));
    }
    items
}

fn load_feed() -> Result<Vec<Value>, BlogError> {
    Ok(parse_feed(&fetch_text(FEED_URL)?))
}

fn origin(u: &url::Url) -> String {
    u.origin().ascii_serialization()
}

fn fetch_post_text(text_url: &str) -> Result<String, BlogError> {
    let site = url::Url::parse(SITE_URL).expect("site url");
    let target = url::Url::parse(text_url).map_err(|_| fetch_err(format!("Post has an invalid plaintext URL: \"{text_url}\"")))?;
    if origin(&target) != origin(&site) {
        return Err(fetch_err(format!("Refusing to fetch post text from a non-canonical origin ({})", origin(&target))));
    }
    fetch_text(text_url)
}

/// `blog(slug)`: the `{type, data}` response.
fn blog_api(slug: Option<&str>) -> Result<Value, BlogError> {
    let mut r = Map::new();
    match slug.filter(|s| !s.is_empty()) {
        None => {
            let posts = load_feed()?;
            let mut d = Map::new();
            d.insert("feedUrl".into(), Value::from(FEED_URL));
            d.insert("posts".into(), Value::Array(posts));
            r.insert("type".into(), Value::from("blog.list"));
            r.insert("data".into(), Value::Object(d));
        }
        Some(slug) => {
            let posts = load_feed()?;
            let wanted = slug.to_lowercase();
            let post = posts.iter().find(|p| p["slug"].as_str().unwrap_or("").to_lowercase() == wanted).ok_or_else(|| BlogError {
                message: format!("No blog post with slug \"{slug}\""),
                suggestions: posts.iter().map(|p| Suggestion::new(p["slug"].as_str().unwrap_or(""), "available post")).collect(),
                code: "ERR_UNKNOWN_POST",
            })?;
            let text_url = match post["textUrl"].as_str() {
                Some(t) if !t.is_empty() => t.to_string(),
                _ => return Err(fetch_err(format!("Post \"{slug}\" has no plaintext alternate in the feed"))),
            };
            let body = fetch_post_text(&text_url)?;
            let mut d = post.as_object().cloned().unwrap_or_default();
            d.insert("feedUrl".into(), Value::from(FEED_URL));
            d.insert("text".into(), Value::from(body));
            r.insert("type".into(), Value::from("blog.detail"));
            r.insert("data".into(), Value::Object(d));
        }
    }
    Ok(Value::Object(r))
}

fn fields(obj: &Value, keys: &[&str]) -> Fields {
    crate::cli::format::json_fields(obj, Some(keys))
}

pub fn run(inv: &Invocation, out: &mut Out) -> CmdResult {
    let slug = inv.arg(0).map(String::from);
    let json = inv.json();
    let run = crate::cli::env::cli_invocation(&inv.cwd);
    let result = match blog_api(slug.as_deref()) {
        Ok(r) => r,
        Err(e) => {
            let mut o = ErrorOpts::code(e.code);
            o.suggestions = e.suggestions;
            return out.cli_error(&e.message, o);
        }
    };
    if json {
        out.json_out_response(&result);
        return Ok(());
    }
    let data = &result["data"];
    if result["type"] == "blog.list" {
        let feed = vec![("feedUrl".to_string(), Field::from_json(&data["feedUrl"]))];
        let posts = data["posts"].as_array().cloned().unwrap_or_default();
        if posts.is_empty() {
            out.emit(&[section("Astryx blog", None), record(&feed), text("No posts found in the feed.")]);
            return Ok(());
        }
        let items: Vec<Fields> = posts.iter().map(|p| fields(p, POST_FIELDS)).collect();
        out.emit(&[section("Astryx blog", None), record(&feed), records(&items), text(&format!("Read one: {run} blog <slug>"))]);
    } else {
        let mut keys: Vec<&str> = POST_FIELDS.to_vec();
        keys.push("feedUrl");
        out.emit(&[record(&fields(data, &keys)), code(data["text"].as_str().unwrap_or(""))]);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_a_feed() {
        let xml = r#"<rss><channel><item><title>Hello &amp; welcome</title><link>https://astryx.atmeta.com/blog/hello/</link><description> Hi </description><pubDate>Mon</pubDate><category>post</category><author>a</author><author>b</author><atom:link href="https://astryx.atmeta.com/blog/hello.txt" rel="alternate" type="text/plain"/></item></channel></rss>"#;
        let items = parse_feed(xml);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["slug"], "hello");
        assert_eq!(items[0]["title"], "Hello & welcome");
        assert_eq!(items[0]["description"], "Hi");
        assert_eq!(items[0]["authors"][1], "b");
        assert_eq!(items[0]["textUrl"], "https://astryx.atmeta.com/blog/hello.txt");
    }
}
