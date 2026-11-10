//! The page plugin's text collection (page-worker.mjs `JSXText` and
//! `JSXElement` visitors): every static JSX text by the function it is in,
//! and each component given only static text, for the dropped-children
//! warning.

use super::page::PageText;
use oxc::ast::ast::{JSXAttributeItem, JSXAttributeName, JSXChild, JSXElement, JSXElementName, JSXMemberExpressionObject, Statement};
use oxc::ast::AstKind;
use oxc::ast_visit::{walk, Visit};
use oxc::span::GetSpan;

fn hiding(name: &str) -> bool {
    [
        "Dialog", "Modal", "Popover", "Tooltip", "Menu", "Drawer", "Sheet", "Tab", "Collapsible", "Accordion", "Disclosure",
        "Overlay", "Layer", "Toast", "Hover", "Select", "Combobox", "Typeahead", "Portal", "Suspense", "Lazy",
    ]
    .iter()
    .any(|w| name.contains(w))
}

fn show_attr_name(n: &str) -> bool {
    const NAMES: [&str; 20] = [
        "open", "isOpen", "defaultOpen", "show", "isShown", "visible", "isVisible", "hidden", "expanded", "isExpanded",
        "defaultExpanded", "collapsed", "isCollapsed", "defaultCollapsed", "collapsible", "when", "if", "limit", "", "",
    ];
    if NAMES.iter().any(|x| !x.is_empty() && *x == n) {
        return true;
    }
    // max[A-Z]\w*
    n.strip_prefix("max").is_some_and(|r| r.chars().next().is_some_and(|c| c.is_ascii_uppercase()) && r.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'))
}

fn has_show_attr(el: &JSXElement) -> bool {
    el.opening_element.attributes.iter().any(|a| match a {
        JSXAttributeItem::Attribute(at) => match &at.name {
            JSXAttributeName::Identifier(id) => show_attr_name(id.name.as_str()),
            _ => false,
        },
        _ => false,
    })
}

fn jsx_name(el: &JSXElement) -> String {
    match &el.opening_element.name {
        JSXElementName::Identifier(i) => i.name.to_string(),
        JSXElementName::IdentifierReference(i) => i.name.to_string(),
        JSXElementName::MemberExpression(m) => {
            let obj = match &m.object {
                JSXMemberExpressionObject::IdentifierReference(i) => i.name.to_string(),
                _ => String::new(),
            };
            format!("{obj}.{}", m.property.name)
        }
        _ => String::new(),
    }
}

fn entity(e: &str) -> Option<&'static str> {
    Some(match e {
        "amp" => "&",
        "lt" => "<",
        "gt" => ">",
        "quot" => "\"",
        "apos" => "'",
        "nbsp" => "\u{a0}",
        "rsquo" => "\u{2019}",
        "lsquo" => "\u{2018}",
        "rdquo" => "\u{201d}",
        "ldquo" => "\u{201c}",
        "mdash" => "\u{2014}",
        "ndash" => "\u{2013}",
        "hellip" => "\u{2026}",
        "middot" => "\u{b7}",
        "copy" => "\u{a9}",
        "reg" => "\u{ae}",
        "trade" => "\u{2122}",
        "times" => "\u{d7}",
        "rarr" => "\u{2192}",
        "larr" => "\u{2190}",
        _ => return None,
    })
}

/// `cleanText(node)` for a JSXText's raw source.
fn clean_text(raw: &str) -> String {
    let rep = |re: &str, s: &str, f: &dyn Fn(&regress::Match, &str) -> String| -> String {
        let r = regress::Regex::with_flags(re, "gi").unwrap();
        let mut out = String::new();
        let mut last = 0;
        for m in r.find_iter(s) {
            out.push_str(&s[last..m.start()]);
            out.push_str(&f(&m, s));
            last = m.end();
        }
        out.push_str(&s[last..]);
        out
    };
    let a = rep(r"&#x([0-9a-f]+);", raw, &|m, s| {
        u32::from_str_radix(&s[m.group(1).unwrap()], 16).ok().and_then(char::from_u32).map(String::from).unwrap_or_default()
    });
    let b = rep(r"&#(\d+);", &a, &|m, s| s[m.group(1).unwrap()].parse::<u32>().ok().and_then(char::from_u32).map(String::from).unwrap_or_default());
    let c = rep(r"&([a-z]+);", &b, &|m, s| entity(&s[m.group(1).unwrap()]).map(String::from).unwrap_or_else(|| s[m.range()].to_string()));
    let ws = regress::Regex::new(r"\s+").unwrap();
    let mut out = String::new();
    let mut last = 0;
    for m in ws.find_iter(&c) {
        out.push_str(&c[last..m.start()]);
        out.push(' ');
        last = m.end();
    }
    out.push_str(&c[last..]);
    crate::commands::gap_report::api::js_trim(&out).to_string()
}

struct V<'a, 's> {
    src: &'s str,
    file: &'s str,
    stack: Vec<AstKind<'a>>,
    texts: &'s mut Vec<PageText>,
    fn_texts: &'s mut Vec<(String, Vec<String>)>,
}

fn is_function(k: &AstKind) -> bool {
    matches!(k, AstKind::Function(_) | AstKind::ArrowFunctionExpression(_))
}

impl<'a, 's> V<'a, 's> {
    fn fn_key(&self) -> String {
        match self.stack.iter().rev().find(|k| is_function(k)) {
            Some(k) => format!("{}:{}", self.file, k.span().start),
            None => format!("{}:module", self.file),
        }
    }
    fn line_of(&self, offset: u32) -> usize {
        self.src[..offset as usize].matches('\n').count() + 1
    }
    fn add_fn_text(&mut self, key: String, v: String) {
        match self.fn_texts.iter_mut().find(|(k, _)| *k == key) {
            Some((_, l)) => l.push(v),
            None => self.fn_texts.push((key, vec![v])),
        }
    }
}

/// Whether a statement holds a return, not counting nested functions.
fn returns_in(st: &Statement) -> bool {
    struct R(bool);
    impl<'a> Visit<'a> for R {
        fn visit_return_statement(&mut self, _: &oxc::ast::ast::ReturnStatement<'a>) {
            self.0 = true;
        }
        fn visit_function(&mut self, _: &oxc::ast::ast::Function<'a>, _: oxc::syntax::scope::ScopeFlags) {}
        fn visit_arrow_function_expression(&mut self, _: &oxc::ast::ast::ArrowFunctionExpression<'a>) {}
    }
    let mut r = R(false);
    r.visit_statement(st);
    r.0
}

impl<'a, 's> Visit<'a> for V<'a, 's> {
    fn enter_node(&mut self, kind: AstKind<'a>) {
        self.stack.push(kind);
    }
    fn leave_node(&mut self, _kind: AstKind<'a>) {
        self.stack.pop();
    }
    fn visit_jsx_text(&mut self, t: &oxc::ast::ast::JSXText<'a>) {
        let raw = &self.src[t.span.start as usize..t.span.end as usize];
        let v = clean_text(raw);
        if v.encode_utf16().count() >= 2 {
            let key = self.fn_key();
            self.add_fn_text(key, v);
        }
        walk::walk_jsx_text(self, t);
    }
    fn visit_jsx_element(&mut self, el: &JSXElement<'a>) {
        // The element itself is on the stack after enter_node, which walk
        // calls; record before walking children, with ancestors only.
        self.record(el);
        walk::walk_jsx_element(self, el);
    }
}

impl<'a, 's> V<'a, 's> {
    fn record(&mut self, el: &JSXElement<'a>) {
        let component = jsx_name(el);
        if !component.chars().next().is_some_and(|c| c.is_ascii_uppercase()) {
            return;
        }
        if el.children.iter().any(|c| !matches!(c, JSXChild::Text(_))) {
            return;
        }
        let own: Vec<String> = el
            .children
            .iter()
            .filter_map(|c| match c {
                JSXChild::Text(t) => Some(clean_text(&self.src[t.span.start as usize..t.span.end as usize])),
                _ => None,
            })
            .filter(|s| !s.is_empty())
            .collect();
        let own = own.join(" ");
        if own.is_empty() {
            return;
        }
        // Ancestors: the stack holds them (this element is not pushed yet).
        let anc: Vec<&AstKind<'a>> = self.stack.iter().rev().collect();
        let mut hidden = hiding(&component) || has_show_attr(el);
        if !hidden {
            for k in &anc {
                if let AstKind::JSXElement(up) = k {
                    if hiding(&jsx_name(up)) || has_show_attr(up) {
                        hidden = true;
                        break;
                    }
                }
            }
        }
        let mut conditional = false;
        for k in &anc {
            if is_function(k) || matches!(k, AstKind::Program(_)) {
                break;
            }
            if matches!(k, AstKind::ConditionalExpression(_) | AstKind::LogicalExpression(_) | AstKind::IfStatement(_) | AstKind::SwitchCase(_) | AstKind::JSXAttribute(_)) {
                conditional = true;
                break;
            }
        }
        if !conditional {
            // Climb through JSX wrappers (and parentheses).
            let mut i = 0;
            let mut top_span = el.span;
            while i < anc.len() && matches!(anc[i], AstKind::JSXElement(_) | AstKind::JSXFragment(_) | AstKind::JSXExpressionContainer(_) | AstKind::ParenthesizedExpression(_)) {
                top_span = anc[i].span();
                i += 1;
            }
            conditional = match anc.get(i) {
                None => false,
                Some(AstKind::ReturnStatement(_)) => false,
                // An arrow whose body is the JSX itself.
                Some(AstKind::ArrowFunctionExpression(a)) => {
                    let _ = top_span;
                    matches!(a.body, oxc::ast::ast::ArrowFunctionBody::FunctionBody(_))
                }
                Some(_) => true,
            };
        }
        if !conditional {
            // A statement of the nearest function's body that holds this
            // element, and the statements before it.
            if let Some(fi) = anc.iter().position(|k| is_function(k)) {
                let body = match anc[fi] {
                    AstKind::Function(f) => f.body.as_deref(),
                    AstKind::ArrowFunctionExpression(a) => match &a.body {
                        oxc::ast::ast::ArrowFunctionBody::FunctionBody(b) => Some(&**b),
                        _ => None,
                    },
                    _ => None,
                };
                if let Some(body) = body {
                    let pos = el.span.start;
                    for st in body.statements.iter() {
                        if st.span().end > pos && st.span().start <= pos {
                            break;
                        }
                        if st.span().start > pos {
                            break;
                        }
                        let returns = match st {
                            Statement::ReturnStatement(_) => true,
                            Statement::IfStatement(_) | Statement::SwitchStatement(_) | Statement::TryStatement(_) => returns_in(st),
                            _ => false,
                        };
                        if returns {
                            conditional = true;
                            break;
                        }
                    }
                }
            }
        }
        let fn_key = self.fn_key();
        let line = self.line_of(el.span.start);
        self.texts.push(PageText { component, text: own, hidden: hidden || conditional, fn_key, line });
    }
}

/// Collect one local module's texts.
pub fn collect(source: &str, file: &str, texts: &mut Vec<PageText>, fn_texts: &mut Vec<(String, Vec<String>)>) {
    use oxc::allocator::Allocator;
    use oxc::parser::{ParseOptions, Parser};
    use oxc::span::SourceType;
    let alloc = Allocator::default();
    let st = SourceType::from_path(file).unwrap_or_else(|_| SourceType::tsx()).with_jsx(true);
    let ret = Parser::new(&alloc, source, st).with_options(ParseOptions { preserve_parens: false, ..Default::default() }).parse();
    if !ret.diagnostics.is_empty() {
        return;
    }
    let mut v = V { src: source, file, stack: vec![], texts, fn_texts };
    v.visit_program(&ret.program);
}
