//! Port of `foundation/render/rebuild.mjs`, `html-reader.mjs` and
//! `component-map.mjs`: rebuild a page module from rendered Astryx markup.

use crate::discovery::nodepath as np;
use std::collections::BTreeSet;

#[derive(Debug, Clone)]
pub enum Node {
    El(El),
    Text(String),
}

#[derive(Debug, Clone)]
pub struct El {
    pub tag: String,
    pub attrs: Vec<(String, String)>,
    pub children: Vec<Node>,
}

impl El {
    fn attr(&self, k: &str) -> Option<&str> {
        self.attrs.iter().rev().find(|(a, _)| a == k).map(|(_, v)| v.as_str())
    }
}

const VOID: [&str; 13] = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"];

fn re_replace(re: &str, flags: &str, s: &str, f: &dyn Fn(&regress::Match, &str) -> String) -> String {
    let r = regress::Regex::with_flags(re, flags).unwrap();
    let mut out = String::new();
    let mut last = 0;
    for m in r.find_iter(s) {
        out.push_str(&s[last..m.start()]);
        out.push_str(&f(&m, s));
        last = m.end();
    }
    out.push_str(&s[last..]);
    out
}

pub fn decode(s: &str) -> String {
    let a = re_replace(r"&#x([0-9a-f]+);", "gi", s, &|m, t| {
        u32::from_str_radix(&t[m.group(1).unwrap()], 16).ok().and_then(char::from_u32).map(String::from).unwrap_or_default()
    });
    let b = re_replace(r"&#(\d+);", "g", &a, &|m, t| t[m.group(1).unwrap()].parse::<u32>().ok().and_then(char::from_u32).map(String::from).unwrap_or_default());
    b.replace("&quot;", "\"").replace("&lt;", "<").replace("&gt;", ">").replace("&nbsp;", "\u{a0}").replace("&amp;", "&")
}

/// `parseHtml(html)`.
pub fn parse_html(html: &str) -> El {
    let mut root = El { tag: "#root".into(), attrs: vec![], children: vec![] };
    // A stack of paths (child indexes from the root).
    let mut stack: Vec<Vec<usize>> = vec![vec![]];
    let re = regress::Regex::with_flags(
        r#"<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>|([^<]+|<)"#,
        "gi",
    )
    .unwrap();
    let attr_re = regress::Regex::with_flags(r#"([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?"#, "g").unwrap();
    fn at<'b>(root: &'b mut El, path: &[usize]) -> &'b mut El {
        let mut cur = root;
        for &i in path {
            cur = match &mut cur.children[i] {
                Node::El(e) => e,
                _ => unreachable!(),
            };
        }
        cur
    }
    let lower = html.to_lowercase();
    let mut pos = 0;
    while pos <= html.len() {
        let Some(m) = re.find_from(html, pos).next() else { break };
        if m.end() == m.start() {
            break;
        }
        pos = m.end();
        let g = |i: usize| m.group(i).map(|r| &html[r]);
        let top_path = stack.last().unwrap().clone();
        if let Some(close) = g(1) {
            let tag = close.to_lowercase();
            // lastIndexOf among stack tags
            let mut found = None;
            for (i, p) in stack.iter().enumerate() {
                if at(&mut root, p).tag == tag {
                    found = Some(i);
                }
            }
            if let Some(i) = found {
                if i > 0 {
                    stack.truncate(i);
                }
            }
        } else if let Some(open) = g(2) {
            let tag = open.to_lowercase();
            let mut attrs = vec![];
            let a_text = g(3).unwrap_or("");
            for am in attr_re.find_iter(a_text) {
                let k = a_text[am.group(1).unwrap()].to_lowercase();
                let v = am.group(2).or(am.group(3)).or(am.group(4)).map(|r| &a_text[r]).unwrap_or("");
                attrs.push((k, decode(v)));
            }
            let top = at(&mut root, &top_path);
            top.children.push(Node::El(El { tag: tag.clone(), attrs, children: vec![] }));
            let idx = top.children.len() - 1;
            let mut path = top_path.clone();
            path.push(idx);
            if ["script", "style", "textarea", "title"].contains(&tag.as_str()) {
                let end = lower[pos..].find(&format!("</{tag}")).map(|e| e + pos);
                let stop = end.unwrap_or(html.len());
                at(&mut root, &path).children.push(Node::Text(html[pos..stop].to_string()));
                pos = stop;
                stack.push(path);
            } else if !VOID.contains(&tag.as_str()) && g(4).unwrap_or("").is_empty() {
                stack.push(path);
            }
        } else if let Some(t) = g(5) {
            at(&mut root, &top_path).children.push(Node::Text(decode(t)));
        }
    }
    root
}

fn find<'b>(n: &'b El, tag: &str) -> Option<&'b El> {
    for c in &n.children {
        if let Node::El(e) = c {
            if e.tag == tag {
                return Some(e);
            }
            if let Some(f) = find(e, tag) {
                return Some(f);
            }
        }
    }
    None
}

fn text_of(n: &Node) -> String {
    match n {
        Node::Text(t) => t.clone(),
        Node::El(e) => {
            if e.tag == "script" || e.tag == "style" {
                String::new()
            } else {
                e.children.iter().map(text_of).collect()
            }
        }
    }
}

fn astryx_class(e: &El) -> Option<String> {
    let re = regress::Regex::new(r"^astryx-[a-z0-9]+(?:-[a-z0-9]+)*$").unwrap();
    e.attr("class")
        .unwrap_or("")
        .split(|c: char| c.is_whitespace())
        .find(|c| re.find(c).is_some())
        .map(|c| c["astryx-".len()..].to_string())
}

fn has_tag(e: &El, tags: &[&str]) -> bool {
    tags.contains(&e.tag.as_str()) || e.children.iter().any(|c| matches!(c, Node::El(x) if astryx_class(x).is_none() && has_tag(x, tags)))
}

const FORM_TAGS: [&str; 3] = ["input", "textarea", "select"];

pub fn pascal(s: &str) -> String {
    re_replace(r"(^|-)([a-z0-9])", "g", s, &|m, t| t[m.group(2).unwrap()].to_uppercase())
}

fn camel(s: &str) -> String {
    re_replace(r"-([a-z0-9])", "g", s, &|m, t| t[m.group(1).unwrap()].to_uppercase())
}

#[derive(Debug, Clone)]
struct Entry {
    name: String,
    module: String,
    props: Vec<String>,
    required: Vec<(String, String)>,
    label: bool,
}

fn component_map(pkg: &str, from_dir: &str) -> Vec<(String, Vec<Entry>)> {
    use crate::js::resolve::{resolve, Mode, Resolved};
    let mut map: Vec<(String, Vec<Entry>)> = vec![];
    let Ok(Resolved::File(f)) = resolve(pkg, std::path::Path::new(&np::join2(from_dir, "noop.js")), Mode::Cjs) else { return map };
    let mut d = np::dirname(&f.to_string_lossy());
    while !np::exists(&np::join2(&d, "package.json")) && np::dirname(&d) != d {
        d = np::dirname(&d);
    }
    let dist = np::join2(&d, "dist");
    if !np::exists(&dist) {
        return map;
    }
    let mut exported: Vec<(String, Vec<String>)> = vec![];
    if let Some(pj) = np::read_json(&np::join2(&np::join2(&dist, ".."), "package.json")) {
        if let Some(ex) = pj.get("exports").and_then(|e| e.as_object()) {
            for (key, value) in ex {
                let target = match value {
                    crate::json::Value::String(s) => Some(s.clone()),
                    v => v.get("default").or_else(|| v.get("import")).and_then(|x| x.as_str()).map(String::from),
                };
                let Some(target) = target else { continue };
                if key == "." || !target.ends_with(".js") {
                    continue;
                }
                let file = np::normalize(&np::join(&[&dist, "..", &target]));
                let Ok(js) = std::fs::read_to_string(&file) else { continue };
                let mut names: Vec<String> = vec![];
                for m in regress::Regex::new(r"export\s*\{([^}]*)\}").unwrap().find_iter(&js) {
                    for part in js[m.group(1).unwrap()].split(',') {
                        let t = part.trim();
                        let name = regress::Regex::new(r"\s+as\s+").unwrap().find_iter(t).last().map(|mm| t[mm.end()..].trim().to_string()).unwrap_or_else(|| t.to_string());
                        if !name.is_empty() {
                            names.push(name);
                        }
                    }
                }
                for m in regress::Regex::new(r"export\s+(?:function|const|class)\s+([A-Za-z0-9_]+)").unwrap().find_iter(&js) {
                    names.push(js[m.group(1).unwrap()].to_string());
                }
                for n in names {
                    let sub = format!("{pkg}/{}", &key[2.min(key.len())..]);
                    match exported.iter_mut().find(|(k, _)| *k == n) {
                        Some((_, l)) => l.push(sub),
                        None => exported.push((n, vec![sub])),
                    }
                }
            }
        }
    }
    let module_for = |name: &str, folder: &str| -> Option<String> {
        let list = &exported.iter().find(|(k, _)| k == name)?.1;
        list.iter()
            .find(|m| m.ends_with(&format!("/{name}")))
            .or_else(|| list.iter().find(|m| m.ends_with(&format!("/{folder}"))))
            .or(list.first())
            .cloned()
    };
    let target_re = regress::Regex::new(r#"themeProps\(\s*['"]([a-z0-9-]+)['"]"#).unwrap();
    let name_re = regress::Regex::with_flags(r#"^([A-Z][A-Za-z0-9]*)\.displayName = ['"]([A-Za-z0-9.]+)['"]"#, "gm").unwrap();
    for dirent in np::read_dir(&dist).unwrap_or_default() {
        if !dirent.is_dir {
            continue;
        }
        let folder = np::join2(&dist, &dirent.name);
        for file in np::read_dir(&folder).unwrap_or_default() {
            let file = file.name;
            if !file.ends_with(".js") {
                continue;
            }
            let Ok(js) = std::fs::read_to_string(np::join2(&folder, &file)) else { continue };
            let targets: Vec<String> = target_re.find_iter(&js).map(|m| js[m.group(1).unwrap()].to_string()).collect();
            if targets.is_empty() {
                continue;
            }
            let names: Vec<String> = name_re.find_iter(&js).map(|m| js[m.group(1).unwrap()].to_string()).collect();
            if names.is_empty() {
                continue;
            }
            let dts = np::join2(&folder, &format!("{}.d.ts", &file[..file.len() - 3]));
            let decl = std::fs::read_to_string(&dts).unwrap_or_default();
            let mut uniq: Vec<String> = vec![];
            for t in targets {
                if !uniq.contains(&t) {
                    uniq.push(t);
                }
            }
            for target in uniq {
                for name in &names {
                    let mut props: Vec<String> = vec![];
                    let mut required: Vec<(String, String)> = vec![];
                    let body_re = regress::Regex::new(&format!(r"interface {name}Props[^{{]*\{{([\s\S]*?)\n\}}")).unwrap();
                    let body = body_re.find(&decl).map(|m| decl[m.group(1).unwrap()].to_string()).unwrap_or_default();
                    let prop_re = regress::Regex::with_flags(r"^\s{4}(?:readonly\s+)?([a-zA-Z][\w]*)\??:\s*([^;]*)", "gm").unwrap();
                    let opt_re = regress::Regex::new(r"^\s{4}(?:readonly\s+)?[a-zA-Z]\w*\?").unwrap();
                    for p in prop_re.find_iter(&body) {
                        let pname = body[p.group(1).unwrap()].to_string();
                        let ptype = body[p.group(2).unwrap()].trim().to_string();
                        if !props.contains(&pname) {
                            props.push(pname.clone());
                        }
                        if opt_re.find(&body[p.range()]).is_none() {
                            required.retain(|(k, _)| *k != pname);
                            required.push((pname, ptype));
                        }
                    }
                    let Some(module) = module_for(name, &dirent.name) else { continue };
                    let label = props.iter().any(|p| p == "label");
                    let entry = Entry { name: name.clone(), module, props: props.clone(), required: required.clone(), label };
                    let pos = match map.iter().position(|(k, _)| *k == target) {
                        Some(i) => i,
                        None => {
                            map.push((target.clone(), vec![]));
                            map.len() - 1
                        }
                    };
                    if !map[pos].1.iter().any(|e| e.name == *name) {
                        map[pos].1.push(entry.clone());
                    }
                    if target == "stack" && name == "Stack" {
                        for alias in ["VStack", "HStack"] {
                            let Some(am) = module_for(alias, &dirent.name) else { continue };
                            if map[pos].1.iter().any(|e| e.name == alias) {
                                continue;
                            }
                            let ap: Vec<String> = props.iter().filter(|p| *p != "direction").cloned().collect();
                            map[pos].1.push(Entry { name: alias.into(), module: am, props: ap, ..entry.clone() });
                        }
                    }
                }
            }
        }
    }
    map
}

fn pick<'b>(list: &'b [Entry], target: &str, el: &El) -> &'b Entry {
    let p = pascal(target);
    let exact = list.iter().find(|e| e.name == p);
    if let Some(dir) = el.attr("data-direction") {
        let prefix = if dir == "horizontal" { "H" } else if dir == "vertical" { "V" } else { "" };
        if !prefix.is_empty() {
            if let Some(hit) = list.iter().find(|e| e.name == format!("{prefix}{p}")) {
                return hit;
            }
        }
    }
    exact.or_else(|| list.iter().find(|e| e.name.ends_with(&p))).unwrap_or(&list[0])
}

fn jsx_text(s: &str) -> String {
    s.chars().map(|c| if "{}<>".contains(c) { format!("{{'{c}'}}") } else { c.to_string() }).collect()
}

fn jsx_attr(s: &str) -> String {
    if s.chars().any(|c| "\"\\\n\r{}".contains(c)) {
        let mut q = String::new();
        crate::json::quote(&mut q, s);
        format!("{{{q}}}")
    } else {
        format!("\"{s}\"")
    }
}

fn collapse(s: &str) -> String {
    crate::commands::gap_report::api::js_trim(&re_replace(r"\s+", "g", s, &|_, _| " ".into())).to_string()
}

fn stand_in(prop: &str, ty: &str, el: &El, text: &str) -> Option<String> {
    let ty = re_replace(r"\/\*[\s\S]*?\*\/", "g", ty, &|_, _| String::new());
    let ty = ty.trim();
    if ty.contains("=>") {
        return Some(format!("{prop}={{() => {{}}}}"));
    }
    if regress::Regex::new(r"\[\]|Array<|Record<|\{").unwrap().find(ty).is_some() {
        return None;
    }
    if regress::Regex::new(r"^number\b").unwrap().find(ty).is_some() {
        let raw = el.attr("aria-valuenow").or_else(|| el.attr(&format!("data-{prop}"))).unwrap_or("0");
        let v = crate::commands::experimental::icon::api::js_number(raw);
        return Some(format!("{prop}={{{}}}", if v.is_finite() { crate::json::js_number_to_string(v) } else { "0".into() }));
    }
    if regress::Regex::new(r"^boolean\b").unwrap().find(ty).is_some() {
        return Some(format!("{prop}={{false}}"));
    }
    if regress::Regex::new(r"^(React\.)?(ReactNode|ReactElement)").unwrap().find(ty).is_some() {
        return Some(format!("{prop}={{null}}"));
    }
    if regress::Regex::new(r"^string\b").unwrap().find(ty).is_some() {
        let named = regress::Regex::with_flags(r"(label|title|name|text)$", "i").unwrap().find(prop).is_some();
        let v = el.attr("aria-label").or_else(|| el.attr("title")).map(String::from).unwrap_or_else(|| if named { text.to_string() } else { String::new() });
        return Some(format!("{prop}={}", jsx_attr(&v)));
    }
    if let Some(m) = regress::Regex::new(r#"^['"]([^'"]*)['"]"#).unwrap().find(ty) {
        return Some(format!("{prop}={}", jsx_attr(&ty[m.group(1).unwrap()])));
    }
    None
}

pub struct Rebuilt {
    pub source: String,
    pub components: Vec<String>,
    pub elements: usize,
    pub unknown: Vec<String>,
    pub omitted: Vec<String>,
}

struct Ctx {
    maps: Vec<Vec<(String, Vec<Entry>)>>,
    imports: Vec<(String, BTreeSet<String>)>,
    unknown: BTreeSet<String>,
    omitted: BTreeSet<String>,
    elements: usize,
}

fn has_astryx(n: &Node) -> bool {
    matches!(n, Node::El(e) if astryx_class(e).is_some() || e.children.iter().any(has_astryx))
}

fn plain(n: &Node, indent: &str) -> Vec<String> {
    match n {
        Node::Text(t) => {
            let t = collapse(t);
            if t.is_empty() { vec![] } else { vec![format!("{indent}<span>{}</span>", jsx_text(&t))] }
        }
        Node::El(e) => {
            if ["script", "style", "template"].contains(&e.tag.as_str()) {
                return vec![];
            }
            let block = e.children.iter().any(|c| matches!(c, Node::El(x) if !["span", "strong", "em", "code", "a", "small", "b", "i"].contains(&x.tag.as_str())));
            if !block {
                let t = collapse(&text_of(n));
                return if t.is_empty() { vec![] } else { vec![format!("{indent}<span>{}</span>", jsx_text(&t))] };
            }
            e.children.iter().flat_map(|c| plain(c, indent)).collect()
        }
    }
}

fn emit(n: &Node, indent: &str, ctx: &mut Ctx) -> Vec<String> {
    let e = match n {
        Node::Text(t) => {
            let t = collapse(t);
            return if t.is_empty() { vec![] } else { vec![format!("{indent}{}", jsx_text(&t))] };
        }
        Node::El(e) => e,
    };
    if ["script", "style", "template"].contains(&e.tag.as_str()) {
        return vec![];
    }
    let target = astryx_class(e);
    if let Some(t) = &target {
        if t == "icon" {
            ctx.omitted.insert(t.clone());
            return vec![];
        }
    }
    let list: Option<Vec<Entry>> = target.as_ref().and_then(|t| {
        ctx.maps.iter().find_map(|m| m.iter().find(|(k, _)| k == t).map(|(_, l)| l.clone()).filter(|l| !l.is_empty()))
    });
    if let (Some(t), None) = (&target, &list) {
        ctx.unknown.insert(t.clone());
    }
    let (Some(list), Some(target)) = (list, target) else {
        if e.children.iter().any(has_astryx) {
            return e.children.iter().flat_map(|c| emit(c, indent, ctx)).collect();
        }
        let t = collapse(&text_of(n));
        if t.is_empty() {
            if e.tag == "img" {
                if let Some(src) = e.attr("src").filter(|s| !s.is_empty()) {
                    return vec![format!("{indent}<img src={} alt={} />", jsx_attr(src), jsx_attr(e.attr("alt").unwrap_or("")))];
                }
            }
            return vec![];
        }
        let tag = if regress::Regex::new(r"^(h[1-6]|p|span|strong|em|code|pre|li|a|label|small)$").unwrap().find(&e.tag).is_some() { e.tag.clone() } else { "span".into() };
        let href = match (tag.as_str(), e.attr("href")) {
            ("a", Some(h)) if !h.is_empty() => format!(" href={}", jsx_attr(h)),
            _ => String::new(),
        };
        return vec![format!("{indent}<{tag}{href}>{}</{tag}>", jsx_text(&t))];
    };
    let entry = pick(&list, &target, e).clone();
    let mut given: Vec<(String, String)> = vec![];
    let mut set = |given: &mut Vec<(String, String)>, k: String, v: String| match given.iter_mut().find(|(a, _)| *a == k) {
        Some(slot) => slot.1 = v,
        None => given.push((k, v)),
    };
    for (k, v) in &e.attrs {
        let Some(rest) = k.strip_prefix("data-") else { continue };
        let prop = camel(rest);
        if rest == "astryx-pressable" || rest == "state" || !entry.props.contains(&prop) {
            continue;
        }
        let val = if v.is_empty() || v == "true" {
            prop.clone()
        } else if v == "false" {
            format!("{prop}={{false}}")
        } else if regress::Regex::new(r"^-?\d+(\.\d+)?$").unwrap().find(v).is_some() {
            format!("{prop}={{{v}}}")
        } else {
            format!("{prop}={}", jsx_attr(v))
        };
        set(&mut given, prop, val);
    }
    for a in ["href", "role"] {
        if let Some(v) = e.attr(a).filter(|v| !v.is_empty()) {
            if entry.props.iter().any(|p| p == a) {
                set(&mut given, a.into(), format!("{a}={}", jsx_attr(v)));
            }
        }
    }
    let t = collapse(&text_of(n));
    let form_control = has_tag(e, &FORM_TAGS);
    let nested = e.children.iter().any(has_astryx) && !form_control;
    let has_children = entry.props.iter().any(|p| p == "children");
    let text_prop = !nested && !t.is_empty() && entry.label && (form_control || !has_children);
    let mut lacking = false;
    for (r, ty) in &entry.required {
        if r == "children" || (text_prop && r == "label") || given.iter().any(|(k, _)| k == r) {
            continue;
        }
        match stand_in(r, ty, e, &t) {
            None => {
                lacking = true;
                break;
            }
            Some(fill) => set(&mut given, r.clone(), fill),
        }
    }
    if lacking {
        ctx.omitted.insert(entry.name.clone());
        return plain(n, indent);
    }
    ctx.elements += 1;
    match ctx.imports.iter_mut().find(|(m, _)| *m == entry.module) {
        Some((_, s)) => {
            s.insert(entry.name.clone());
        }
        None => ctx.imports.push((entry.module.clone(), [entry.name.clone()].into_iter().collect())),
    }
    let props: Vec<String> = given.iter().map(|(_, v)| v.clone()).collect();
    let open = format!("{indent}<{}{}", entry.name, if props.is_empty() { String::new() } else { format!(" {}", props.join(" ")) });
    if nested {
        let deeper = format!("{indent}  ");
        let inner: Vec<String> = e.children.iter().flat_map(|c| emit(c, &deeper, ctx)).collect();
        return if inner.is_empty() {
            vec![format!("{open} />")]
        } else {
            let mut v = vec![format!("{open}>")];
            v.extend(inner);
            v.push(format!("{indent}</{}>", entry.name));
            v
        };
    }
    if t.is_empty() || VOID.contains(&e.tag.as_str()) || (form_control && !text_prop) {
        return vec![format!("{open} />")];
    }
    if text_prop {
        let with = open.replacen(&format!("<{}", entry.name), &format!("<{} label={}", entry.name, jsx_attr(&t)), 1);
        return vec![format!("{with} />")];
    }
    vec![format!("{open}>{}</{}>", jsx_text(&t), entry.name)]
}

fn one_line(s: &str) -> String {
    s.chars().map(|c| {
        let n = c as u32;
        if n < 32 || (127..=159).contains(&n) || n == 0x2028 || n == 0x2029 { ' ' } else { c }
    }).collect()
}

/// `rebuildPage(html, fromDir)`.
pub fn rebuild_page(html: &str, from_dir: &str) -> Rebuilt {
    let doc = parse_html(html);
    let body = find(&doc, "body").cloned().unwrap_or_else(|| doc.clone());
    let maps = ["@astryxdesign/core", "@astryxdesign/lab", "@astryxdesign/charts"].iter().map(|p| component_map(p, from_dir)).collect();
    let mut ctx = Ctx { maps, imports: vec![], unknown: BTreeSet::new(), omitted: BTreeSet::new(), elements: 0 };
    let lines: Vec<String> = body.children.iter().flat_map(|c| emit(c, "    ", &mut ctx)).collect();
    let mut imports = ctx.imports.clone();
    imports.sort_by(|a, b| crate::cli::collate::locale_compare(&a.0, &b.0));
    let import_lines: Vec<String> = imports
        .iter()
        .map(|(m, names)| {
            let mut n: Vec<&String> = names.iter().collect();
            n.sort_by(|a, b| crate::discovery::jsort::cmp_utf16(a, b));
            format!("import {{{}}} from '{m}';", n.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(", "))
        })
        .collect();
    let title_node = find(&doc, "title").map(|t| text_of(&Node::El(t.clone()))).unwrap_or_default();
    let title = crate::commands::gap_report::api::js_trim(&decode(&title_node)).to_string();
    let mut src = vec![
        format!("// Rebuilt by astryx experimental render --reverse from rendered markup{}.", if title.is_empty() { String::new() } else { format!(": {}", one_line(&title)) }),
        "// Text and layout come from the markup; styling, state and behavior do not,".into(),
        "// so review it before use.".into(),
        String::new(),
    ];
    src.extend(import_lines);
    src.extend([String::new(), "export default function Page() {".into(), "  return (".into(), "    <>".into()]);
    src.extend(lines.iter().map(|l| format!("  {l}")));
    src.extend(["    </>".into(), "  );".into(), "}".into(), String::new()]);
    let mut components: Vec<String> = imports.iter().flat_map(|(_, s)| s.iter().cloned()).collect();
    components.sort_by(|a, b| crate::discovery::jsort::cmp_utf16(a, b));
    let mut unknown: Vec<String> = ctx.unknown.into_iter().collect();
    unknown.sort_by(|a, b| crate::discovery::jsort::cmp_utf16(a, b));
    let mut omitted: Vec<String> = ctx.omitted.into_iter().collect();
    omitted.sort_by(|a, b| crate::discovery::jsort::cmp_utf16(a, b));
    Rebuilt { source: src.join("\n"), components, elements: ctx.elements, unknown, omitted }
}
