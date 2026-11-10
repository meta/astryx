//! A small DOM, native in Rust, that a render draws charts in: the parts
//! React's client renderer and recharts touch, with linkedom's serialization
//! and estimates (the JS CLI draws charts in a linkedom document).
//!
//! Nodes live in a thread-local arena; each has one JS object (React keeps
//! its own fields on it), made from a prototype per kind.

use boa_engine::object::builtins::{JsArray, JsProxyBuilder};
use boa_engine::object::FunctionObjectBuilder;
use boa_engine::property::PropertyDescriptor;
use boa_engine::{js_string, Context, JsData, JsNativeError, JsObject, JsResult, JsString, JsValue, NativeFunction};
use boa_gc::{Finalize, Trace};
use std::cell::RefCell;

const SVG_NS: &str = "http://www.w3.org/2000/svg";
const HTML_NS: &str = "http://www.w3.org/1999/xhtml";

#[derive(Clone, Debug)]
pub enum Kind {
    Document,
    Doctype,
    Fragment,
    Element {
        local: String,
        svg: bool,
        /// In the order they were added; serialized newest first.
        attrs: Vec<(String, String)>,
        style: Vec<(String, String)>,
        /// Whether `style` matches the style attribute (it does not after
        /// `setAttribute('style', ...)`).
        style_synced: bool,
    },
    Text(String),
    Comment(String),
    /// Markup set through `innerHTML`, kept as written.
    Raw(String),
}

#[derive(Clone, Debug)]
pub struct Node {
    pub kind: Kind,
    pub parent: Option<usize>,
    pub children: Vec<usize>,
}

#[derive(Default)]
pub struct Dom {
    pub nodes: Vec<Node>,
}

impl Dom {
    fn add(&mut self, kind: Kind) -> usize {
        self.nodes.push(Node { kind, parent: None, children: vec![] });
        self.nodes.len() - 1
    }
    fn detach(&mut self, id: usize) {
        if let Some(p) = self.nodes[id].parent.take() {
            self.nodes[p].children.retain(|c| *c != id);
        }
    }
    fn insert(&mut self, parent: usize, child: usize, before: Option<usize>) {
        // A fragment moves its children.
        if matches!(self.nodes[child].kind, Kind::Fragment) {
            let kids = std::mem::take(&mut self.nodes[child].children);
            for k in kids {
                self.nodes[k].parent = None;
                self.insert(parent, k, before);
            }
            return;
        }
        self.detach(child);
        let at = before.and_then(|b| self.nodes[parent].children.iter().position(|c| *c == b)).unwrap_or(self.nodes[parent].children.len());
        self.nodes[parent].children.insert(at, child);
        self.nodes[child].parent = Some(parent);
    }
    fn text_content(&self, id: usize) -> String {
        match &self.nodes[id].kind {
            Kind::Text(t) | Kind::Comment(t) => t.clone(),
            Kind::Raw(r) => r.clone(),
            _ => {
                let mut s = String::new();
                self.collect_text(id, &mut s);
                s
            }
        }
    }
    fn collect_text(&self, id: usize, out: &mut String) {
        for &c in &self.nodes[id].children {
            match &self.nodes[c].kind {
                Kind::Text(t) => out.push_str(t),
                Kind::Element { .. } | Kind::Fragment => self.collect_text(c, out),
                _ => {}
            }
        }
    }
    pub fn attr(&self, id: usize, name: &str) -> Option<String> {
        match &self.nodes[id].kind {
            Kind::Element { attrs, .. } => attrs.iter().find(|(n, _)| n == name).map(|(_, v)| v.clone()),
            _ => None,
        }
    }
    pub fn set_attr(&mut self, id: usize, name: &str, value: &str) {
        let value = if name == "class" { normalize_class(value) } else { value.to_string() };
        if let Kind::Element { attrs, style_synced, .. } = &mut self.nodes[id].kind {
            match attrs.iter_mut().find(|(n, _)| n == name) {
                Some(slot) => slot.1 = value,
                None => attrs.push((name.to_string(), value)),
            }
            if name == "style" {
                *style_synced = false;
            }
        }
    }
    fn remove_attr(&mut self, id: usize, name: &str) {
        if let Kind::Element { attrs, .. } = &mut self.nodes[id].kind {
            attrs.retain(|(n, _)| n != name);
        }
    }
    /// linkedom's `updateKeys`: the style map, re-read from the attribute
    /// when the attribute changed under it.
    fn sync_style(&mut self, id: usize) -> bool {
        let Kind::Element { attrs, style, style_synced, .. } = &mut self.nodes[id].kind else { return false };
        let attr = attrs.iter().find(|(n, _)| n == "style").map(|(_, v)| v.clone());
        match attr {
            None => {
                style.clear();
                false
            }
            Some(v) => {
                if !*style_synced {
                    style.clear();
                    let re = regress::Regex::new(r"\s*;\s*").unwrap();
                    let mut last = 0;
                    let mut rules = vec![];
                    for m in re.find_iter(&v) {
                        rules.push(v[last..m.start()].to_string());
                        last = m.end();
                    }
                    rules.push(v[last..].to_string());
                    for rule in rules {
                        let mut parts = rule.split(':');
                        let key = parts.next().unwrap_or("").trim().to_string();
                        let rest: Vec<&str> = parts.collect();
                        if rest.is_empty() {
                            continue;
                        }
                        let value = rest.join(":").trim().to_string();
                        if !key.is_empty() && !value.is_empty() {
                            match style.iter_mut().find(|(k, _)| *k == key) {
                                Some(s) => s.1 = value,
                                None => style.push((key, value)),
                            }
                        }
                    }
                    *style_synced = true;
                }
                true
            }
        }
    }
    pub fn style_get(&mut self, id: usize, name: &str) -> String {
        self.sync_style(id);
        let key = uhyphen(name);
        match &self.nodes[id].kind {
            Kind::Element { style, .. } => style.iter().find(|(k, _)| *k == key).map(|(_, v)| v.clone()).unwrap_or_default(),
            _ => String::new(),
        }
    }
    pub fn style_set(&mut self, id: usize, name: &str, value: Option<String>) {
        let had = self.sync_style(id);
        let key = uhyphen(name);
        let Kind::Element { attrs, style, style_synced, .. } = &mut self.nodes[id].kind else { return };
        match value {
            None => style.retain(|(k, _)| *k != key),
            Some(v) => match style.iter_mut().find(|(k, _)| *k == key) {
                Some(s) => s.1 = v,
                None => style.push((key, v)),
            },
        }
        let text = style.iter().map(|(k, v)| format!("{k}:{v}")).collect::<Vec<_>>().join(";");
        if !had {
            attrs.push(("style".into(), text));
        } else if let Some(slot) = attrs.iter_mut().find(|(n, _)| n == "style") {
            slot.1 = text;
        }
        *style_synced = true;
    }

    /// linkedom's `toString` of a node.
    pub fn serialize(&self, id: usize, out: &mut String) {
        match &self.nodes[id].kind {
            Kind::Text(t) => out.push_str(&escape_text(t)),
            Kind::Comment(t) => {
                out.push_str("<!--");
                out.push_str(t);
                out.push_str("-->");
            }
            Kind::Raw(r) => out.push_str(r),
            Kind::Doctype => out.push_str("<!DOCTYPE html>"),
            Kind::Document | Kind::Fragment => {
                for &c in &self.nodes[id].children {
                    self.serialize(c, out);
                }
            }
            Kind::Element { local, svg, attrs, .. } => {
                out.push('<');
                out.push_str(local);
                for (name, value) in attrs.iter().rev() {
                    let a = attr_string(name, value);
                    if a == "id" || a == "class" || a == "style" {
                        continue;
                    }
                    out.push(' ');
                    out.push_str(&a);
                }
                let kids = &self.nodes[id].children;
                if kids.is_empty() {
                    if *svg {
                        out.push_str(" />");
                    } else if is_void(local) {
                        out.push('>');
                    } else {
                        out.push_str("></");
                        out.push_str(local);
                        out.push('>');
                    }
                } else {
                    out.push('>');
                    for &c in kids {
                        self.serialize(c, out);
                    }
                    out.push_str("</");
                    out.push_str(local);
                    out.push('>');
                }
            }
        }
    }
    pub fn inner_html(&self, id: usize) -> String {
        let mut s = String::new();
        for &c in &self.nodes[id].children {
            self.serialize(c, &mut s);
        }
        s
    }
    pub fn descendants(&self, id: usize, out: &mut Vec<usize>) {
        for &c in &self.nodes[id].children {
            if matches!(self.nodes[c].kind, Kind::Element { .. }) {
                out.push(c);
            }
            self.descendants(c, out);
        }
    }
    fn local(&self, id: usize) -> Option<&str> {
        match &self.nodes[id].kind {
            Kind::Element { local, .. } => Some(local),
            _ => None,
        }
    }
    fn classes(&self, id: usize) -> Vec<String> {
        self.attr(id, "class").map(|c| c.split_whitespace().map(String::from).collect()).unwrap_or_default()
    }
}

fn normalize_class(v: &str) -> String {
    let mut seen: Vec<&str> = vec![];
    let re = regress::Regex::new(r"\s+").unwrap();
    let mut last = 0;
    let mut toks = vec![];
    for m in re.find_iter(v) {
        toks.push(&v[last..m.start()]);
        last = m.end();
    }
    toks.push(&v[last..]);
    for t in toks {
        if !t.is_empty() && !seen.contains(&t) {
            seen.push(t);
        }
    }
    seen.join(" ")
}

const EMPTY_ATTRS: [&str; 31] = [
    "allowfullscreen", "allowpaymentrequest", "async", "autofocus", "autoplay", "checked", "class", "contenteditable", "controls", "default", "defer", "disabled",
    "draggable", "formnovalidate", "hidden", "id", "ismap", "itemscope", "loop", "multiple", "muted", "nomodule", "novalidate", "open", "playsinline", "readonly",
    "required", "reversed", "selected", "style", "truespeed",
];

fn attr_string(name: &str, value: &str) -> String {
    if EMPTY_ATTRS.contains(&name) && value.is_empty() {
        return name.to_string();
    }
    format!("{name}=\"{}\"", value.replace('"', "&quot;"))
}

fn escape_text(t: &str) -> String {
    let mut s = String::with_capacity(t.len());
    for c in t.chars() {
        match c {
            '&' => s.push_str("&amp;"),
            '<' => s.push_str("&lt;"),
            '>' => s.push_str("&gt;"),
            '\u{A0}' => s.push_str("&#160;"),
            o => s.push(o),
        }
    }
    s
}

fn is_void(local: &str) -> bool {
    matches!(
        local.to_ascii_lowercase().as_str(),
        "area" | "base" | "br" | "col" | "embed" | "hr" | "img" | "input" | "keygen" | "link" | "menuitem" | "meta" | "param" | "source" | "track" | "wbr"
    )
}

/// `uhyphen`: camelCase to kebab-case.
pub fn uhyphen(s: &str) -> String {
    let re = regress::Regex::new(r"(([A-Z0-9])([A-Z0-9][a-z]))|(([a-z0-9]+)([A-Z]))").unwrap();
    let mut out = String::new();
    let mut last = 0;
    for m in re.find_iter(s) {
        out.push_str(&s[last..m.start()]);
        let g = |i: usize| m.group(i).map(|r| &s[r]).unwrap_or("");
        out.push_str(&format!("{}{}-{}{}", g(2), g(5), g(3), g(6)));
        last = m.end();
    }
    out.push_str(&s[last..]);
    out.to_lowercase()
}

// ---- JS side ----

#[derive(Clone, Copy, Trace, Finalize, JsData)]
#[boa_gc(empty_trace)]
struct NodeRef(usize);

#[derive(Clone)]
struct Protos {
    element: JsObject,
    html: JsObject,
    iframe: JsObject,
    svg: JsObject,
    text: JsObject,
    comment: JsObject,
    document: JsObject,
    fragment: JsObject,
    doctype: JsObject,
    style: JsObject,
}

thread_local! {
    pub static DOM: RefCell<Dom> = RefCell::new(Dom::default());
    static OBJS: RefCell<Vec<Option<JsObject>>> = const { RefCell::new(vec![]) };
    static STYLES: RefCell<Vec<Option<JsObject>>> = const { RefCell::new(vec![]) };
    static PROTOS: RefCell<Option<Protos>> = const { RefCell::new(None) };
    static DOC: RefCell<Option<usize>> = const { RefCell::new(None) };
    /// What `window` answers before falling back to the global object.
    static EXTRAS: RefCell<Option<JsObject>> = const { RefCell::new(None) };
    static WINDOW: RefCell<Option<JsObject>> = const { RefCell::new(None) };
}

fn err(msg: &str) -> boa_engine::JsError {
    JsNativeError::typ().with_message(msg.to_string()).into()
}

fn nid(this: &JsValue) -> JsResult<usize> {
    this.as_object().and_then(|o| o.downcast_ref::<NodeRef>().map(|r| r.0)).ok_or_else(|| err("Illegal invocation"))
}

fn arg_nid(args: &[JsValue], i: usize) -> Option<usize> {
    args.get(i).and_then(|v| v.as_object()).and_then(|o| o.downcast_ref::<NodeRef>().map(|r| r.0))
}

fn arg_str(args: &[JsValue], i: usize, ctx: &mut Context) -> JsResult<String> {
    Ok(args.get(i).cloned().unwrap_or_default().to_string(ctx)?.to_std_string_lossy())
}

fn s(v: &str) -> JsValue {
    JsValue::from(JsString::from(v))
}

fn with_dom<R>(f: impl FnOnce(&mut Dom) -> R) -> R {
    DOM.with(|d| f(&mut d.borrow_mut()))
}

/// The JS object of a node (made once).
fn obj(id: usize, ctx: &mut Context) -> JsValue {
    if let Some(o) = OBJS.with(|o| o.borrow().get(id).cloned().flatten()) {
        return o.into();
    }
    let protos = PROTOS.with(|p| p.borrow().clone()).expect("dom installed");
    let proto = with_dom(|d| match &d.nodes[id].kind {
        Kind::Element { svg: true, .. } => protos.svg.clone(),
        Kind::Element { local, .. } if local == "iframe" => protos.iframe.clone(),
        Kind::Element { .. } => protos.html.clone(),
        Kind::Text(_) | Kind::Raw(_) => protos.text.clone(),
        Kind::Comment(_) => protos.comment.clone(),
        Kind::Document => protos.document.clone(),
        Kind::Fragment => protos.fragment.clone(),
        Kind::Doctype => protos.doctype.clone(),
    });
    let o = JsObject::from_proto_and_data(Some(proto), NodeRef(id));
    let _ = ctx;
    OBJS.with(|objs| {
        let mut objs = objs.borrow_mut();
        if objs.len() <= id {
            objs.resize(id + 1, None);
        }
        objs[id] = Some(o.clone());
    });
    o.into()
}

fn opt_obj(id: Option<usize>, ctx: &mut Context) -> JsValue {
    id.map(|i| obj(i, ctx)).unwrap_or(JsValue::null())
}

fn func(ctx: &mut Context, name: &str, len: usize, f: boa_engine::native_function::NativeFunctionPointer) -> JsObject {
    FunctionObjectBuilder::new(ctx.realm(), NativeFunction::from_fn_ptr(f)).name(JsString::from(name)).length(len).build().into()
}

fn method(ctx: &mut Context, o: &JsObject, name: &str, len: usize, f: boa_engine::native_function::NativeFunctionPointer) {
    let fo = func(ctx, name, len, f);
    o.define_property_or_throw(JsString::from(name), PropertyDescriptor::builder().value(fo).writable(true).enumerable(false).configurable(true), ctx).expect("define method");
}

type Fp = boa_engine::native_function::NativeFunctionPointer;

fn accessor(ctx: &mut Context, o: &JsObject, name: &str, get: Fp, set: Option<Fp>) {
    let g = func(ctx, &format!("get {name}"), 0, get);
    let mut b = PropertyDescriptor::builder().get(g).enumerable(false).configurable(true);
    if let Some(set) = set {
        let st = func(ctx, &format!("set {name}"), 1, set);
        b = b.set(st);
    }
    o.define_property_or_throw(JsString::from(name), b, ctx).expect("define accessor");
}

fn new_proto(ctx: &mut Context, parent: Option<&JsObject>) -> JsObject {
    let o = JsObject::with_object_proto(ctx.intrinsics());
    if let Some(p) = parent {
        o.set_prototype(Some(p.clone()));
    }
    o
}

fn node_type(d: &Dom, id: usize) -> i32 {
    match d.nodes[id].kind {
        Kind::Element { .. } => 1,
        Kind::Text(_) | Kind::Raw(_) => 3,
        Kind::Comment(_) => 8,
        Kind::Document => 9,
        Kind::Doctype => 10,
        Kind::Fragment => 11,
    }
}

fn install_node(ctx: &mut Context, p: &JsObject) {
    accessor(ctx, p, "nodeType", |t, _, _| {
        let id = nid(t)?;
        Ok(with_dom(|d| node_type(d, id)).into())
    }, None);
    accessor(
        ctx,
        p,
        "nodeName",
        |t, _, _| {
            let id = nid(t)?;
            Ok(s(&with_dom(|d| match &d.nodes[id].kind {
                Kind::Element { local, svg, .. } => {
                    if *svg {
                        local.clone()
                    } else {
                        local.to_uppercase()
                    }
                }
                Kind::Text(_) | Kind::Raw(_) => "#text".into(),
                Kind::Comment(_) => "#comment".into(),
                Kind::Document => "#document".into(),
                Kind::Fragment => "#document-fragment".into(),
                Kind::Doctype => "html".into(),
            })))
        },
        None,
    );
    accessor(ctx, p, "parentNode", |t, _, ctx| {
        let id = nid(t)?;
        let p = with_dom(|d| d.nodes[id].parent);
        Ok(opt_obj(p, ctx))
    }, None);
    accessor(ctx, p, "parentElement", |t, _, ctx| {
        let id = nid(t)?;
        let p = with_dom(|d| d.nodes[id].parent.filter(|p| matches!(d.nodes[*p].kind, Kind::Element { .. })));
        Ok(opt_obj(p, ctx))
    }, None);
    accessor(ctx, p, "firstChild", |t, _, ctx| {
        let id = nid(t)?;
        let c = with_dom(|d| d.nodes[id].children.first().copied());
        Ok(opt_obj(c, ctx))
    }, None);
    accessor(ctx, p, "lastChild", |t, _, ctx| {
        let id = nid(t)?;
        let c = with_dom(|d| d.nodes[id].children.last().copied());
        Ok(opt_obj(c, ctx))
    }, None);
    accessor(ctx, p, "nextSibling", |t, _, ctx| {
        let id = nid(t)?;
        let c = with_dom(|d| d.nodes[id].parent.and_then(|p| {
            let k = &d.nodes[p].children;
            k.iter().position(|c| *c == id).and_then(|i| k.get(i + 1).copied())
        }));
        Ok(opt_obj(c, ctx))
    }, None);
    accessor(ctx, p, "previousSibling", |t, _, ctx| {
        let id = nid(t)?;
        let c = with_dom(|d| d.nodes[id].parent.and_then(|p| {
            let k = &d.nodes[p].children;
            k.iter().position(|c| *c == id).and_then(|i| if i > 0 { k.get(i - 1).copied() } else { None })
        }));
        Ok(opt_obj(c, ctx))
    }, None);
    accessor(ctx, p, "childNodes", |t, _, ctx| {
        let id = nid(t)?;
        let kids = with_dom(|d| d.nodes[id].children.clone());
        let vals: Vec<JsValue> = kids.into_iter().map(|k| obj(k, ctx)).collect();
        Ok(JsArray::from_iter(vals, ctx).into())
    }, None);
    accessor(ctx, p, "children", |t, _, ctx| {
        let id = nid(t)?;
        let kids = with_dom(|d| d.nodes[id].children.iter().copied().filter(|c| matches!(d.nodes[*c].kind, Kind::Element { .. })).collect::<Vec<_>>());
        let vals: Vec<JsValue> = kids.into_iter().map(|k| obj(k, ctx)).collect();
        Ok(JsArray::from_iter(vals, ctx).into())
    }, None);
    accessor(ctx, p, "ownerDocument", |t, _, ctx| {
        let id = nid(t)?;
        let doc = DOC.with(|d| *d.borrow());
        if with_dom(|d| matches!(d.nodes[id].kind, Kind::Document)) {
            return Ok(JsValue::null());
        }
        Ok(opt_obj(doc, ctx))
    }, None);
    accessor(ctx, p, "isConnected", |t, _, _| {
        let id = nid(t)?;
        let doc = DOC.with(|d| *d.borrow());
        Ok(with_dom(|d| {
            let mut cur = Some(id);
            while let Some(c) = cur {
                if Some(c) == doc {
                    return true;
                }
                cur = d.nodes[c].parent;
            }
            false
        })
        .into())
    }, None);
    accessor(
        ctx,
        p,
        "textContent",
        |t, _, _| {
            let id = nid(t)?;
            if with_dom(|d| matches!(d.nodes[id].kind, Kind::Document | Kind::Doctype)) {
                return Ok(JsValue::null());
            }
            Ok(s(&with_dom(|d| d.text_content(id))))
        },
        Some(|t, args, ctx| {
            let id = nid(t)?;
            let v = args.first().cloned().unwrap_or_default();
            let text = if v.is_null_or_undefined() { String::new() } else { v.to_string(ctx)?.to_std_string_lossy() };
            with_dom(|d| match &mut d.nodes[id].kind {
                Kind::Text(x) | Kind::Comment(x) | Kind::Raw(x) => *x = text,
                _ => {
                    for c in std::mem::take(&mut d.nodes[id].children) {
                        d.nodes[c].parent = None;
                    }
                    if !text.is_empty() {
                        let t = d.add(Kind::Text(text));
                        d.insert(id, t, None);
                    }
                }
            });
            Ok(JsValue::undefined())
        }),
    );
    let value_get: Fp = |t, _, _| {
        let id = nid(t)?;
        Ok(with_dom(|d| match &d.nodes[id].kind {
            Kind::Text(x) | Kind::Comment(x) | Kind::Raw(x) => s(x),
            _ => JsValue::null(),
        }))
    };
    let value_set: Fp = |t, args, ctx| {
        let id = nid(t)?;
        let v = arg_str(args, 0, ctx)?;
        with_dom(|d| {
            if let Kind::Text(x) | Kind::Comment(x) | Kind::Raw(x) = &mut d.nodes[id].kind {
                *x = v;
            }
        });
        Ok(JsValue::undefined())
    };
    accessor(ctx, p, "nodeValue", value_get, Some(value_set));
    accessor(ctx, p, "data", value_get, Some(value_set));
    method(ctx, p, "appendChild", 1, |t, args, ctx| {
        let id = nid(t)?;
        let c = arg_nid(args, 0).ok_or_else(|| err("appendChild: not a node"))?;
        with_dom(|d| d.insert(id, c, None));
        Ok(args[0].clone())
        .map(|v| {
            let _ = ctx;
            v
        })
    });
    method(ctx, p, "insertBefore", 2, |t, args, _| {
        let id = nid(t)?;
        let c = arg_nid(args, 0).ok_or_else(|| err("insertBefore: not a node"))?;
        let before = arg_nid(args, 1);
        with_dom(|d| d.insert(id, c, before));
        Ok(args[0].clone())
    });
    method(ctx, p, "removeChild", 1, |t, args, _| {
        let id = nid(t)?;
        let c = arg_nid(args, 0).ok_or_else(|| err("removeChild: not a node"))?;
        with_dom(|d| {
            if d.nodes[c].parent == Some(id) {
                d.detach(c);
            }
        });
        Ok(args[0].clone())
    });
    method(ctx, p, "replaceChild", 2, |t, args, _| {
        let id = nid(t)?;
        let new = arg_nid(args, 0).ok_or_else(|| err("replaceChild: not a node"))?;
        let old = arg_nid(args, 1).ok_or_else(|| err("replaceChild: not a node"))?;
        with_dom(|d| {
            d.insert(id, new, Some(old));
            d.detach(old);
        });
        Ok(args[1].clone())
    });
    method(ctx, p, "remove", 0, |t, _, _| {
        let id = nid(t)?;
        with_dom(|d| d.detach(id));
        Ok(JsValue::undefined())
    });
    method(ctx, p, "contains", 1, |t, args, _| {
        let id = nid(t)?;
        let Some(mut c) = arg_nid(args, 0) else { return Ok(false.into()) };
        Ok(with_dom(|d| loop {
            if c == id {
                return true;
            }
            match d.nodes[c].parent {
                Some(p) => c = p,
                None => return false,
            }
        })
        .into())
    });
    method(ctx, p, "hasChildNodes", 0, |t, _, _| {
        let id = nid(t)?;
        Ok(with_dom(|d| !d.nodes[id].children.is_empty()).into())
    });
    method(ctx, p, "getRootNode", 0, |t, _, ctx| {
        let mut id = nid(t)?;
        while let Some(p) = with_dom(|d| d.nodes[id].parent) {
            id = p;
        }
        Ok(obj(id, ctx))
    });
    method(ctx, p, "addEventListener", 2, |_, _, _| Ok(JsValue::undefined()));
    method(ctx, p, "removeEventListener", 2, |_, _, _| Ok(JsValue::undefined()));
    method(ctx, p, "dispatchEvent", 1, |_, _, _| Ok(true.into()));
    method(ctx, p, "cloneNode", 1, |t, args, ctx| {
        let id = nid(t)?;
        let deep = args.first().map(|v| v.to_boolean()).unwrap_or(false);
        fn clone(d: &mut Dom, id: usize, deep: bool) -> usize {
            let kind = d.nodes[id].kind.clone();
            let n = d.add(kind);
            if deep {
                for c in d.nodes[id].children.clone() {
                    let cc = clone(d, c, true);
                    d.insert(n, cc, None);
                }
            }
            n
        }
        let n = with_dom(|d| clone(d, id, deep));
        Ok(obj(n, ctx))
    });
}

trait IntoJs {
    fn into_js(self) -> JsValue;
}
impl IntoJs for i32 {
    fn into_js(self) -> JsValue {
        JsValue::from(self)
    }
}
impl<T: IntoJs, E> IntoJs for Result<T, E>
where
    E: Into<boa_engine::JsError>,
{
    fn into_js(self) -> JsValue {
        match self {
            Ok(v) => v.into_js(),
            Err(_) => JsValue::undefined(),
        }
    }
}

// ---- selectors (what page code and the chart pass ask for) ----

#[derive(Debug, Default)]
struct Compound {
    tag: Option<String>,
    id: Option<String>,
    classes: Vec<String>,
    attrs: Vec<(String, Option<String>)>,
    scope: bool,
}

fn parse_selector(sel: &str) -> Vec<Vec<(char, Compound)>> {
    sel.split(',')
        .map(|part| {
            let mut out: Vec<(char, Compound)> = vec![];
            let mut comb = ' ';
            for tok in part.split_whitespace() {
                if tok == ">" || tok == "+" || tok == "~" {
                    comb = tok.chars().next().unwrap();
                    continue;
                }
                let mut c = Compound::default();
                let cs: Vec<char> = tok.chars().collect();
                let mut i = 0;
                let read = |i: &mut usize| {
                    let st = *i;
                    while *i < cs.len() && !matches!(cs[*i], '.' | '#' | '[' | ':') {
                        *i += 1;
                    }
                    cs[st..*i].iter().collect::<String>()
                };
                if i < cs.len() && !matches!(cs[i], '.' | '#' | '[' | ':') {
                    let t = read(&mut i);
                    if t != "*" {
                        c.tag = Some(t);
                    }
                }
                while i < cs.len() {
                    match cs[i] {
                        '.' => {
                            i += 1;
                            c.classes.push(read(&mut i));
                        }
                        '#' => {
                            i += 1;
                            c.id = Some(read(&mut i));
                        }
                        '[' => {
                            let st = i + 1;
                            while i < cs.len() && cs[i] != ']' {
                                i += 1;
                            }
                            let inner: String = cs[st..i.min(cs.len())].iter().collect();
                            i += 1;
                            match inner.split_once('=') {
                                Some((k, v)) => c.attrs.push((k.trim().to_string(), Some(v.trim().trim_matches(|q| q == '"' || q == '\'').to_string()))),
                                None => c.attrs.push((inner.trim().to_string(), None)),
                            }
                        }
                        ':' => {
                            i += 1;
                            let p = read(&mut i);
                            if p == "scope" {
                                c.scope = true;
                            }
                        }
                        _ => i += 1,
                    }
                }
                out.push((comb, c));
                comb = ' ';
            }
            out
        })
        .collect()
}

fn matches_compound(d: &Dom, id: usize, c: &Compound, scope: usize) -> bool {
    if c.scope {
        return id == scope;
    }
    let Some(local) = d.local(id) else { return false };
    if let Some(t) = &c.tag {
        if !t.eq_ignore_ascii_case(local) {
            return false;
        }
    }
    if let Some(i) = &c.id {
        if d.attr(id, "id").as_deref() != Some(i.as_str()) {
            return false;
        }
    }
    let classes = d.classes(id);
    if !c.classes.iter().all(|k| classes.contains(k)) {
        return false;
    }
    c.attrs.iter().all(|(k, v)| match (d.attr(id, k), v) {
        (Some(_), None) => true,
        (Some(a), Some(v)) => a == *v,
        _ => false,
    })
}

fn matches_chain(d: &Dom, id: usize, chain: &[(char, Compound)], scope: usize) -> bool {
    let Some(((comb, last), rest)) = chain.split_last() else { return true };
    if !matches_compound(d, id, last, scope) {
        return false;
    }
    if rest.is_empty() {
        return true;
    }
    match comb {
        '>' => d.nodes[id].parent.is_some_and(|p| matches_chain(d, p, rest, scope)),
        _ => {
            let mut cur = d.nodes[id].parent;
            while let Some(p) = cur {
                if matches_chain(d, p, rest, scope) {
                    return true;
                }
                cur = d.nodes[p].parent;
            }
            false
        }
    }
}

pub fn query_all(d: &Dom, root: usize, sel: &str) -> Vec<usize> {
    let chains = parse_selector(sel);
    let mut all = vec![];
    d.descendants(root, &mut all);
    all.into_iter().filter(|id| chains.iter().any(|c| matches_chain(d, *id, c, root))).collect()
}

fn install_element(ctx: &mut Context, p: &JsObject) {
    accessor(ctx, p, "tagName", |t, _, _| {
        let id = nid(t)?;
        Ok(s(&with_dom(|d| match &d.nodes[id].kind {
            Kind::Element { local, svg, .. } => if *svg { local.clone() } else { local.to_uppercase() },
            _ => String::new(),
        })))
    }, None);
    accessor(ctx, p, "localName", |t, _, _| Ok(s(with_dom(|d| d.local(nid(t)?).map(String::from).ok_or_else(|| err("not an element")))?.as_str())), None);
    accessor(ctx, p, "namespaceURI", |t, _, _| {
        let id = nid(t)?;
        Ok(s(with_dom(|d| if matches!(d.nodes[id].kind, Kind::Element { svg: true, .. }) { SVG_NS } else { HTML_NS })))
    }, None);
    accessor(ctx, p, "id", |t, _, _| Ok(s(&with_dom(|d| d.attr(nid(t)?, "id").unwrap_or_default().into_ok())?)), Some(|t, args, ctx| {
        let id = nid(t)?;
        let v = arg_str(args, 0, ctx)?;
        with_dom(|d| d.set_attr(id, "id", &v));
        Ok(JsValue::undefined())
    }));
    accessor(ctx, p, "className", |t, _, ctx| {
        let id = nid(t)?;
        let (svg, class) = with_dom(|d| (matches!(d.nodes[id].kind, Kind::Element { svg: true, .. }), d.attr(id, "class").unwrap_or_default()));
        if svg {
            let o = JsObject::with_object_proto(ctx.intrinsics());
            o.set(js_string!("baseVal"), s(""), false, ctx)?;
            o.set(js_string!("animVal"), s(""), false, ctx)?;
            return Ok(o.into());
        }
        Ok(s(&class))
    }, Some(|t, args, ctx| {
        let id = nid(t)?;
        let v = arg_str(args, 0, ctx)?;
        with_dom(|d| d.set_attr(id, "class", &v));
        Ok(JsValue::undefined())
    }));
    accessor(ctx, p, "style", |t, _, ctx| {
        let id = nid(t)?;
        style_obj(id, ctx)
    }, None);
    accessor(ctx, p, "innerHTML", |t, _, _| Ok(s(&with_dom(|d| d.inner_html(nid(t)?).into_ok())?)), Some(|t, args, ctx| {
        let id = nid(t)?;
        let html = arg_str(args, 0, ctx)?;
        with_dom(|d| {
            for c in std::mem::take(&mut d.nodes[id].children) {
                d.nodes[c].parent = None;
            }
            if !html.is_empty() {
                let r = d.add(Kind::Raw(html));
                d.insert(id, r, None);
            }
        });
        Ok(JsValue::undefined())
    }));
    accessor(ctx, p, "outerHTML", |t, _, _| {
        let id = nid(t)?;
        Ok(s(&with_dom(|d| {
            let mut o = String::new();
            d.serialize(id, &mut o);
            o
        })))
    }, None);
    accessor(ctx, p, "firstElementChild", |t, _, ctx| {
        let id = nid(t)?;
        let c = with_dom(|d| d.nodes[id].children.iter().copied().find(|c| matches!(d.nodes[*c].kind, Kind::Element { .. })));
        Ok(opt_obj(c, ctx))
    }, None);
    method(ctx, p, "getAttribute", 1, |t, args, ctx| {
        let id = nid(t)?;
        let n = arg_str(args, 0, ctx)?;
        Ok(with_dom(|d| d.attr(id, &n)).map(|v| s(&v)).unwrap_or(JsValue::null()))
    });
    method(ctx, p, "hasAttribute", 1, |t, args, ctx| {
        let id = nid(t)?;
        let n = arg_str(args, 0, ctx)?;
        Ok(with_dom(|d| d.attr(id, &n).is_some()).into())
    });
    let set_attr: Fp = |t, args, ctx| {
        let id = nid(t)?;
        let n = arg_str(args, 0, ctx)?;
        let v = arg_str(args, 1, ctx)?;
        with_dom(|d| d.set_attr(id, &n, &v));
        Ok(JsValue::undefined())
    };
    method(ctx, p, "setAttribute", 2, set_attr);
    method(ctx, p, "setAttributeNS", 3, |t, args, ctx| {
        let id = nid(t)?;
        let n = arg_str(args, 1, ctx)?;
        let v = arg_str(args, 2, ctx)?;
        with_dom(|d| d.set_attr(id, &n, &v));
        Ok(JsValue::undefined())
    });
    let rm: Fp = |t, args, ctx| {
        let id = nid(t)?;
        let n = arg_str(args, if args.len() > 1 { 1 } else { 0 }, ctx)?;
        with_dom(|d| d.remove_attr(id, &n));
        Ok(JsValue::undefined())
    };
    method(ctx, p, "removeAttribute", 1, rm);
    method(ctx, p, "removeAttributeNS", 2, rm);
    method(ctx, p, "querySelectorAll", 1, |t, args, ctx| {
        let id = nid(t)?;
        let sel = arg_str(args, 0, ctx)?;
        let ids = with_dom(|d| query_all(d, id, &sel));
        let vals: Vec<JsValue> = ids.into_iter().map(|i| obj(i, ctx)).collect();
        Ok(JsArray::from_iter(vals, ctx).into())
    });
    method(ctx, p, "querySelector", 1, |t, args, ctx| {
        let id = nid(t)?;
        let sel = arg_str(args, 0, ctx)?;
        let first = with_dom(|d| query_all(d, id, &sel).first().copied());
        Ok(opt_obj(first, ctx))
    });
    method(ctx, p, "getElementsByTagName", 1, |t, args, ctx| {
        let id = nid(t)?;
        let sel = arg_str(args, 0, ctx)?;
        let ids = with_dom(|d| query_all(d, id, &sel));
        let vals: Vec<JsValue> = ids.into_iter().map(|i| obj(i, ctx)).collect();
        Ok(JsArray::from_iter(vals, ctx).into())
    });
    method(ctx, p, "getElementsByClassName", 1, |t, args, ctx| {
        let id = nid(t)?;
        let names = arg_str(args, 0, ctx)?;
        let want: Vec<String> = names.split_whitespace().map(String::from).collect();
        let ids = with_dom(|d| {
            let mut all = vec![];
            d.descendants(id, &mut all);
            all.into_iter().filter(|i| {
                let c = d.classes(*i);
                !want.is_empty() && want.iter().all(|w| c.contains(w))
            }).collect::<Vec<_>>()
        });
        let vals: Vec<JsValue> = ids.into_iter().map(|i| obj(i, ctx)).collect();
        Ok(JsArray::from_iter(vals, ctx).into())
    });
    method(ctx, p, "matches", 1, |t, args, ctx| {
        let id = nid(t)?;
        let sel = arg_str(args, 0, ctx)?;
        Ok(with_dom(|d| parse_selector(&sel).iter().any(|c| matches_chain(d, id, c, usize::MAX))).into())
    });
    method(ctx, p, "closest", 1, |t, args, ctx| {
        let id = nid(t)?;
        let sel = arg_str(args, 0, ctx)?;
        let found = with_dom(|d| {
            let chains = parse_selector(&sel);
            let mut cur = Some(id);
            while let Some(c) = cur {
                if matches!(d.nodes[c].kind, Kind::Element { .. }) && chains.iter().any(|ch| matches_chain(d, c, ch, usize::MAX)) {
                    return Some(c);
                }
                cur = d.nodes[c].parent;
            }
            None
        });
        Ok(opt_obj(found, ctx))
    });
    method(ctx, p, "getBoundingClientRect", 0, |t, _, ctx| {
        let id = nid(t)?;
        let (w, h) = with_dom(|d| bounding_box(d, id));
        let o = JsObject::with_object_proto(ctx.intrinsics());
        for (k, v) in [("x", 0.0), ("y", 0.0), ("top", 0.0), ("left", 0.0), ("right", w), ("bottom", h), ("width", w), ("height", h)] {
            o.set(JsString::from(k), JsValue::from(v), false, ctx)?;
        }
        Ok(o.into())
    });
    method(ctx, p, "focus", 0, |_, _, _| Ok(JsValue::undefined()));
    method(ctx, p, "blur", 0, |_, _, _| Ok(JsValue::undefined()));
}

trait IntoOk<T> {
    fn into_ok(self) -> JsResult<T>;
}
impl<T> IntoOk<T> for T {
    fn into_ok(self) -> JsResult<T> {
        Ok(self)
    }
}

/// The box the chart document gives an element: the text recharts measures
/// and a legend are estimated, everything else measures zero.
fn bounding_box(d: &mut Dom, id: usize) -> (f64, f64) {
    if d.attr(id, "id").as_deref() == Some("recharts_measurement_span") {
        let from_style = d.style_get(id, "fontSize");
        let size = js_parse_float(&from_style).filter(|v| *v != 0.0 && !v.is_nan()).unwrap_or(14.0);
        let len = d.text_content(id).encode_utf16().count() as f64;
        return (js_round(len * size * 0.6), js_round(size * 1.2));
    }
    if d.attr(id, "class").unwrap_or_default().contains("recharts-legend-wrapper") {
        return legend_box(d, id);
    }
    (0.0, 0.0)
}

fn js_round(x: f64) -> f64 {
    (x + 0.5).floor()
}

fn js_parse_float(s: &str) -> Option<f64> {
    let t = s.trim_start();
    let re = regress::Regex::new(r"^[+-]?(?:Infinity|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)").unwrap();
    let m = re.find(t)?;
    t[m.range()].parse().ok()
}

fn style_attr_value(d: &Dom, id: usize, prop: &str) -> Option<f64> {
    let style = d.attr(id, "style").unwrap_or_default();
    let re = regress::Regex::new(&format!(r"(?:^|;)\s*{prop}\s*:\s*(-?[\d.]+)px")).unwrap();
    re.find(&style).and_then(|m| m.group(1).map(|r| style[r].to_string())).and_then(|v| v.parse::<f64>().ok())
}

fn legend_box(d: &mut Dom, id: usize) -> (f64, f64) {
    let mut cur = Some(id);
    while let Some(c) = cur {
        if d.classes(c).iter().any(|k| k == "recharts-responsive-container") {
            return (0.0, 0.0);
        }
        cur = d.nodes[c].parent;
    }
    let items = query_all(d, id, ".recharts-legend-item");
    let widths: Vec<f64> = items.iter().map(|i| 14.0 + 4.0 + 7.0 * d.text_content(*i).encode_utf16().count() as f64 + 10.0).collect();
    let display_block = regress::Regex::new(r"display:\s*block").unwrap();
    let vertical = items.iter().any(|i| display_block.find(&d.attr(*i, "style").unwrap_or_default()).is_some());
    if vertical {
        return (widths.iter().cloned().fold(0.0, f64::max), 20.0 * items.len() as f64 + 10.0);
    }
    let total: f64 = widths.iter().sum();
    let style = d.attr(id, "style").unwrap_or_default();
    let re = regress::Regex::new(r"(?:^|;)\s*width\s*:\s*([\d.]+)px").unwrap();
    let room = re.find(&style).and_then(|m| m.group(1).map(|r| style[r].to_string())).and_then(|v| v.parse::<f64>().ok()).unwrap_or(f64::NAN);
    let rows = if room > 0.0 { (total / room).ceil().max(1.0) } else { 1.0 };
    (if room > 0.0 { total.min(room) } else { total }, 24.0 * rows)
}

/// `markLegends(root)`: note where a responsive chart's vertical legend
/// sits, for the chart CSS.
pub fn mark_legends(d: &mut Dom, root: usize) {
    let display_block = regress::Regex::new(r"display:\s*block").unwrap();
    for wrapper in query_all(d, root, ".recharts-responsive-container > .recharts-wrapper") {
        let Some(legend) = d.nodes[wrapper].children.iter().copied().find(|c| d.classes(*c).iter().any(|k| k == "recharts-legend-wrapper")) else { continue };
        let items = query_all(d, legend, ".recharts-legend-item");
        if !items.iter().any(|i| display_block.find(&d.attr(*i, "style").unwrap_or_default()).is_some()) {
            continue;
        }
        let style = d.attr(legend, "style").unwrap_or_default();
        let width: f64 = d.attr(wrapper, "width").and_then(|w| w.parse().ok()).unwrap_or(f64::NAN);
        let left = style_attr_value(d, legend, "left");
        let right = regress::Regex::new(r"(?:^|;)\s*right\s*:").unwrap().find(&style).is_some();
        let side = if right {
            Some("right")
        } else if left.is_some_and(|l| width > 0.0 && l < width * 0.2) {
            Some("left")
        } else {
            None
        };
        let Some(side) = side else { continue };
        d.set_attr(wrapper, "data-legend-side", side);
        let top = style_attr_value(d, legend, "top");
        let height: f64 = d.attr(wrapper, "height").and_then(|w| w.parse().ok()).unwrap_or(f64::NAN);
        if regress::Regex::new(r"(?:^|;)\s*bottom\s*:").unwrap().find(&style).is_some() {
            d.set_attr(wrapper, "data-legend-bottom", "");
        } else if top.is_some_and(|t| t > 0.0 && height > 0.0 && t > height * 0.2) {
            d.set_attr(wrapper, "data-legend-middle", "");
        }
    }
}

/// An element's `style`: a proxy whose reads and writes go to the element.
fn style_obj(id: usize, ctx: &mut Context) -> JsResult<JsValue> {
    if let Some(o) = STYLES.with(|o| o.borrow().get(id).cloned().flatten()) {
        return Ok(o.into());
    }
    let proto = PROTOS.with(|p| p.borrow().as_ref().map(|p| p.style.clone())).expect("dom installed");
    let target = JsObject::from_proto_and_data(Some(proto), NodeRef(id));
    let proxy = JsProxyBuilder::new(target)
        .get(|_, args, ctx| {
            let target = args.first().and_then(|v| v.as_object()).ok_or_else(|| err("style"))?;
            let id = target.downcast_ref::<NodeRef>().map(|r| r.0).ok_or_else(|| err("style"))?;
            let key = args.get(1).cloned().unwrap_or_default();
            if key.is_symbol() {
                return Ok(JsValue::undefined());
            }
            let name = key.to_string(ctx)?.to_std_string_lossy();
            // Methods on the prototype first, as linkedom's `name in prototype`.
            let pkey = boa_engine::property::PropertyKey::from(JsString::from(name.as_str()));
            if target.has_property(pkey.clone(), ctx)? {
                return target.get(pkey, ctx);
            }
            Ok(with_dom(|d| {
                if name == "length" {
                    d.sync_style(id);
                    if let Kind::Element { style, .. } = &d.nodes[id].kind {
                        return JsValue::from(style.len() as i32);
                    }
                }
                s(&d.style_get(id, &name))
            }))
        })
        .set(|_, args, ctx| {
            let target = args.first().and_then(|v| v.as_object()).ok_or_else(|| err("style"))?;
            let id = target.downcast_ref::<NodeRef>().map(|r| r.0).ok_or_else(|| err("style"))?;
            let name = args.get(1).cloned().unwrap_or_default().to_string(ctx)?.to_std_string_lossy();
            let v = args.get(2).cloned().unwrap_or_default();
            if name == "cssText" {
                let text = v.to_string(ctx)?.to_std_string_lossy();
                with_dom(|d| d.set_attr(id, "style", &text));
                return Ok(true.into());
            }
            let value = if v.is_null_or_undefined() { None } else { Some(v.to_string(ctx)?.to_std_string_lossy()) };
            with_dom(|d| d.style_set(id, &name, value));
            Ok(true.into())
        })
        .build(ctx)?;
    let o: JsObject = proxy.into();
    STYLES.with(|st| {
        let mut st = st.borrow_mut();
        if st.len() <= id {
            st.resize(id + 1, None);
        }
        st[id] = Some(o.clone());
    });
    Ok(o.into())
}

fn install_style_proto(ctx: &mut Context, p: &JsObject) {
    method(ctx, p, "getPropertyValue", 1, |t, args, ctx| {
        let id = nid(t)?;
        let n = arg_str(args, 0, ctx)?;
        Ok(s(&with_dom(|d| d.style_get(id, &n))))
    });
    method(ctx, p, "setProperty", 2, |t, args, ctx| {
        let id = nid(t)?;
        let n = arg_str(args, 0, ctx)?;
        let v = args.get(1).cloned().unwrap_or_default();
        let value = if v.is_null_or_undefined() { None } else { Some(v.to_string(ctx)?.to_std_string_lossy()) };
        with_dom(|d| d.style_set(id, &n, value));
        Ok(JsValue::undefined())
    });
    method(ctx, p, "removeProperty", 1, |t, args, ctx| {
        let id = nid(t)?;
        let n = arg_str(args, 0, ctx)?;
        with_dom(|d| d.style_set(id, &n, None));
        Ok(JsValue::undefined())
    });
    accessor(ctx, p, "cssText", |t, _, _| {
        let id = nid(t)?;
        Ok(s(&with_dom(|d| {
            d.sync_style(id);
            match &d.nodes[id].kind {
                Kind::Element { style, .. } => style.iter().map(|(k, v)| format!("{k}:{v}")).collect::<Vec<_>>().join(";"),
                _ => String::new(),
            }
        })))
    }, None);
}

fn install_document(ctx: &mut Context, p: &JsObject) {
    method(ctx, p, "createElement", 1, |_, args, ctx| {
        let local = arg_str(args, 0, ctx)?;
        let id = with_dom(|d| d.add(Kind::Element { local, svg: false, attrs: vec![], style: vec![], style_synced: true }));
        Ok(obj(id, ctx))
    });
    method(ctx, p, "createElementNS", 2, |_, args, ctx| {
        let ns = args.first().cloned().unwrap_or_default();
        let svg = ns.as_string().is_some_and(|s| s.to_std_string_lossy() == SVG_NS);
        let local = arg_str(args, 1, ctx)?;
        let id = with_dom(|d| d.add(Kind::Element { local, svg, attrs: vec![], style: vec![], style_synced: true }));
        Ok(obj(id, ctx))
    });
    method(ctx, p, "createTextNode", 1, |_, args, ctx| {
        let t = arg_str(args, 0, ctx)?;
        let id = with_dom(|d| d.add(Kind::Text(t)));
        Ok(obj(id, ctx))
    });
    method(ctx, p, "createComment", 1, |_, args, ctx| {
        let t = arg_str(args, 0, ctx)?;
        let id = with_dom(|d| d.add(Kind::Comment(t)));
        Ok(obj(id, ctx))
    });
    method(ctx, p, "createDocumentFragment", 0, |_, _, ctx| {
        let id = with_dom(|d| d.add(Kind::Fragment));
        Ok(obj(id, ctx))
    });
    method(ctx, p, "getElementsByClassName", 1, |t, args, ctx| {
        let id = nid(t)?;
        let names = arg_str(args, 0, ctx)?;
        let want: Vec<String> = names.split_whitespace().map(String::from).collect();
        let ids = with_dom(|d| {
            let mut all = vec![];
            d.descendants(id, &mut all);
            all.into_iter().filter(|i| {
                let c = d.classes(*i);
                !want.is_empty() && want.iter().all(|w| c.contains(w))
            }).collect::<Vec<_>>()
        });
        let vals: Vec<JsValue> = ids.into_iter().map(|i| obj(i, ctx)).collect();
        Ok(JsArray::from_iter(vals, ctx).into())
    });
    method(ctx, p, "getElementById", 1, |t, args, ctx| {
        let id = nid(t)?;
        let want = arg_str(args, 0, ctx)?;
        let found = with_dom(|d| {
            let mut all = vec![];
            d.descendants(id, &mut all);
            all.into_iter().find(|i| d.attr(*i, "id").as_deref() == Some(want.as_str()))
        });
        Ok(opt_obj(found, ctx))
    });
    method(ctx, p, "querySelectorAll", 1, |t, args, ctx| {
        let id = nid(t)?;
        let sel = arg_str(args, 0, ctx)?;
        let ids = with_dom(|d| query_all(d, id, &sel));
        let vals: Vec<JsValue> = ids.into_iter().map(|i| obj(i, ctx)).collect();
        Ok(JsArray::from_iter(vals, ctx).into())
    });
    method(ctx, p, "querySelector", 1, |t, args, ctx| {
        let id = nid(t)?;
        let sel = arg_str(args, 0, ctx)?;
        let first = with_dom(|d| query_all(d, id, &sel).first().copied());
        Ok(opt_obj(first, ctx))
    });
    let find_tag = |tag: &'static str| move |id: usize| with_dom(|d| {
        let mut all = vec![];
        d.descendants(id, &mut all);
        all.into_iter().find(|i| d.local(*i) == Some(tag))
    });
    let _ = find_tag;
    accessor(ctx, p, "documentElement", |t, _, ctx| {
        let id = nid(t)?;
        let f = with_dom(|d| d.nodes[id].children.iter().copied().find(|c| d.local(*c) == Some("html")));
        Ok(opt_obj(f, ctx))
    }, None);
    accessor(ctx, p, "head", |t, _, ctx| {
        let id = nid(t)?;
        let f = with_dom(|d| {
            let mut all = vec![];
            d.descendants(id, &mut all);
            all.into_iter().find(|i| d.local(*i) == Some("head"))
        });
        Ok(opt_obj(f, ctx))
    }, None);
    accessor(ctx, p, "body", |t, _, ctx| {
        let id = nid(t)?;
        let f = with_dom(|d| {
            let mut all = vec![];
            d.descendants(id, &mut all);
            all.into_iter().find(|i| d.local(*i) == Some("body"))
        });
        Ok(opt_obj(f, ctx))
    }, None);
    accessor(ctx, p, "defaultView", |_, _, ctx| ctx.global_object().get(js_string!("window"), ctx), None);
}

fn ctor(ctx: &mut Context, global: &JsObject, name: &str, proto: &JsObject) {
    let f = func(ctx, name, 0, |_, _, _| Err(err("Illegal constructor")));
    f.define_property_or_throw(js_string!("prototype"), PropertyDescriptor::builder().value(proto.clone()).writable(false).enumerable(false).configurable(false), ctx).expect("prototype");
    proto.define_property_or_throw(js_string!("constructor"), PropertyDescriptor::builder().value(f.clone()).writable(true).enumerable(false).configurable(true), ctx).expect("constructor");
    global.set(JsString::from(name), f, false, ctx).expect("ctor");
}

/// Make a fresh document and point `window` and `document` at it, with the
/// DOM classes on `window`. Returns the window object.
pub fn install(ctx: &mut Context) -> JsResult<JsObject> {
    DOM.with(|d| *d.borrow_mut() = Dom::default());
    OBJS.with(|o| o.borrow_mut().clear());
    STYLES.with(|o| o.borrow_mut().clear());
    let node = new_proto(ctx, None);
    install_node(ctx, &node);
    let element = new_proto(ctx, Some(&node));
    install_element(ctx, &element);
    let html = new_proto(ctx, Some(&element));
    let iframe = new_proto(ctx, Some(&html));
    let svg = new_proto(ctx, Some(&element));
    let chardata = new_proto(ctx, Some(&node));
    let text = new_proto(ctx, Some(&chardata));
    let comment = new_proto(ctx, Some(&chardata));
    let document = new_proto(ctx, Some(&node));
    install_document(ctx, &document);
    let fragment = new_proto(ctx, Some(&node));
    let doctype = new_proto(ctx, Some(&node));
    let style = new_proto(ctx, None);
    install_style_proto(ctx, &style);
    PROTOS.with(|p| {
        *p.borrow_mut() = Some(Protos {
            element: element.clone(),
            html: html.clone(),
            iframe: iframe.clone(),
            svg: svg.clone(),
            text: text.clone(),
            comment: comment.clone(),
            document: document.clone(),
            fragment: fragment.clone(),
            doctype: doctype.clone(),
            style,
        })
    });
    let doc = with_dom(|d| {
        let doc = d.add(Kind::Document);
        let dt = d.add(Kind::Doctype);
        d.insert(doc, dt, None);
        let el = |d: &mut Dom, local: &str| d.add(Kind::Element { local: local.into(), svg: false, attrs: vec![], style: vec![], style_synced: true });
        let html = el(d, "html");
        let head = el(d, "head");
        let body = el(d, "body");
        d.insert(doc, html, None);
        d.insert(html, head, None);
        d.insert(html, body, None);
        doc
    });
    DOC.with(|d| *d.borrow_mut() = Some(doc));
    let window = JsObject::with_object_proto(ctx.intrinsics());
    for (name, proto) in [
        ("Node", &node),
        ("Element", &element),
        ("HTMLElement", &html),
        ("HTMLIFrameElement", &iframe),
        ("SVGElement", &svg),
        ("CharacterData", &chardata),
        ("Text", &text),
        ("Comment", &comment),
        ("Document", &document),
        ("HTMLDocument", &document),
        ("DocumentFragment", &fragment),
    ] {
        ctor(ctx, &window, name, proto);
    }
    let docv = obj(doc, ctx);
    window.set(js_string!("document"), docv, false, ctx)?;
    let navigator = JsObject::with_object_proto(ctx.intrinsics());
    navigator.set(js_string!("userAgent"), s("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.150 Safari/537.36"), false, ctx)?;
    window.set(js_string!("navigator"), navigator, false, ctx)?;
    EXTRAS.with(|e| *e.borrow_mut() = Some(window.clone()));
    // linkedom's window: the global object, with the document and the DOM
    // classes in front of it; what is set on it lands on the global object.
    let global = ctx.global_object();
    let proxy = JsProxyBuilder::new(global)
        .get(|_, args, ctx| {
            let target = args.first().and_then(|v| v.as_object()).ok_or_else(|| err("window"))?;
            let key = args.get(1).cloned().unwrap_or_default();
            let pkey = key.to_property_key(ctx)?;
            if let boa_engine::property::PropertyKey::String(name) = &pkey {
                if name.to_std_string_lossy() == "window" {
                    return Ok(WINDOW.with(|w| w.borrow().clone()).map(JsValue::from).unwrap_or_default());
                }
            }
            if let Some(extras) = EXTRAS.with(|e| e.borrow().clone()) {
                if extras.has_own_property(pkey.clone(), ctx)? {
                    return extras.get(pkey, ctx);
                }
            }
            target.get(pkey, ctx)
        })
        .set(|_, args, ctx| {
            let target = args.first().and_then(|v| v.as_object()).ok_or_else(|| err("window"))?;
            let pkey = args.get(1).cloned().unwrap_or_default().to_property_key(ctx)?;
            target.set(pkey, args.get(2).cloned().unwrap_or_default(), false, ctx)?;
            Ok(true.into())
        })
        .build(ctx)?;
    let w: JsObject = proxy.into();
    WINDOW.with(|x| *x.borrow_mut() = Some(w.clone()));
    Ok(w)
}

/// `[...host.querySelectorAll('astryx-chart')].map(el => el.innerHTML)`
/// after `markLegends(host)`, for a JS node.
pub fn chart_pictures(host: &JsValue, all: bool) -> JsResult<Vec<String>> {
    let id = nid(host)?;
    Ok(with_dom(|d| {
        mark_legends(d, id);
        if all {
            vec![d.inner_html(id)]
        } else {
            query_all(d, id, "astryx-chart").into_iter().map(|c| d.inner_html(c)).collect()
        }
    }))
}

/// Give the chart pass its hooks: `__astryxDom.install()` makes the
/// document, `__astryxDom.pictures(host, all)` reads what was drawn.
pub fn install_hooks() {
    crate::js::live::with_live(|session| {
        let ctx = session.ctx();
        let hooks = JsObject::with_object_proto(ctx.intrinsics());
        method(ctx, &hooks, "install", 0, |_, _, ctx| Ok(install(ctx)?.into()));
        method(ctx, &hooks, "pictures", 2, |_, args, ctx| {
            let host = args.first().cloned().unwrap_or_default();
            let all = args.get(1).map(|v| v.to_boolean()).unwrap_or(false);
            let pics = chart_pictures(&host, all)?;
            let vals: Vec<JsValue> = pics.iter().map(|p| s(p)).collect();
            Ok(JsArray::from_iter(vals, ctx).into())
        });
        let global = ctx.global_object();
        let _ = global.set(js_string!("__astryxDom"), hooks, false, ctx);
    });
}
