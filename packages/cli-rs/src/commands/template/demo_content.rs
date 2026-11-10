//! `replaceDemoContent`: replace JSX elements imported from the docs-only
//! demo-content module with a `<Text>` placeholder.

use oxc::allocator::Allocator;
use oxc::ast::ast::*;
use oxc_ast_visit::{walk, Visit};
use oxc::parser::Parser;
use oxc::semantic::{Semantic, SemanticBuilder};
use oxc::span::{GetSpan, SourceType};
use oxc::syntax::scope::ScopeId;
use oxc::syntax::symbol::SymbolId;
use std::collections::HashSet;

use super::source::DEMO_CONTENT_MODULE;

const PLACEHOLDER_TEXT: &str = "Card content";
const TEXT_MODULE: &str = "@astryxdesign/core/Text";

fn unsafe_demo(reason: &str) -> String {
    format!(
        "Demo content from {DEMO_CONTENT_MODULE} cannot be replaced safely: {reason}. Use each element as a JSX tag with no children or with one element child, and give each prop a literal or a variable the file also reads elsewhere."
    )
}

/// What a prop reads: a variable name and the symbol it resolves to.
type Read = (String, Option<SymbolId>);

struct Elem {
    start: u32,
    end: u32,
    open_start: u32,
    open_end: u32,
    name: String,
    scope: ScopeId,
    /// Ok(reads) or the error staticPropReads throws.
    props: Result<Vec<Read>, String>,
    /// wrappedElement: Ok(None) no content, Ok(Some(span)) one element, Err.
    wrapped: Result<Option<(u32, u32)>, String>,
    /// assertStaticDemoElement's children check.
    has_children: bool,
    /// String and template literal spans inside the element.
    strings: Vec<(u32, u32)>,
}

struct V<'s, 'a> {
    sem: &'s Semantic<'a>,
    demo: HashSet<SymbolId>,
    elems: Vec<Elem>,
    err: Option<String>,
    written: HashSet<String>,
    all_strings: Vec<(u32, u32)>,
}

impl<'s, 'a> V<'s, 'a> {
    fn sym_of(&self, id: &IdentifierReference) -> Option<SymbolId> {
        let r = id.reference_id.get()?;
        self.sem.scoping().get_reference(r).symbol_id()
    }
    fn scope_of(&self, id: &IdentifierReference) -> ScopeId {
        id.reference_id
            .get()
            .map(|r| self.sem.scoping().get_reference(r).scope_id())
            .unwrap_or_else(|| self.sem.scoping().root_scope_id())
    }
    fn fail(&mut self, m: String) {
        if self.err.is_none() {
            self.err = Some(m);
        }
    }
}

fn is_literal(e: &Expression) -> bool {
    match e {
        Expression::StringLiteral(_) | Expression::NumericLiteral(_) | Expression::BooleanLiteral(_) | Expression::NullLiteral(_) => true,
        Expression::TemplateLiteral(t) => t.expressions.is_empty(),
        Expression::UnaryExpression(u) => {
            u.operator == UnaryOperator::UnaryNegation && matches!(u.argument, Expression::NumericLiteral(_))
        }
        _ => false,
    }
}

fn var_read(v: &V, e: &Expression, out: &mut Vec<Read>) -> bool {
    match e {
        Expression::Identifier(id) => {
            out.push((id.name.to_string(), v.sym_of(id)));
            true
        }
        Expression::StaticMemberExpression(m) => var_read(v, &m.object, out),
        Expression::UnaryExpression(u) => u.operator == UnaryOperator::LogicalNot && var_read(v, &u.argument, out),
        _ => false,
    }
}

fn prop_reads(v: &V, el: &JSXOpeningElement, name: &str) -> Result<Vec<Read>, String> {
    let mut out = Vec::new();
    for a in &el.attributes {
        match a {
            JSXAttributeItem::SpreadAttribute(_) => return Err(unsafe_demo(&format!("<{name}> spreads props"))),
            JSXAttributeItem::Attribute(attr) => {
                let ok = match &attr.value {
                    None | Some(JSXAttributeValue::StringLiteral(_)) => true,
                    Some(JSXAttributeValue::ExpressionContainer(c)) => match &c.expression {
                        JSXExpression::EmptyExpression(_) => false,
                        other => {
                            let e = other.to_expression();
                            is_literal(e) || var_read(v, e, &mut out)
                        }
                    },
                    _ => false,
                };
                if !ok {
                    let an = match &attr.name {
                        JSXAttributeName::Identifier(i) => i.name.to_string(),
                        JSXAttributeName::NamespacedName(_) => String::new(),
                    };
                    return Err(unsafe_demo(&format!("<{name}> prop {an} is not a literal value or a variable read")));
                }
            }
        }
    }
    Ok(out)
}

fn whitespace_text(c: &JSXChild) -> bool {
    matches!(c, JSXChild::Text(t) if t.value.trim().is_empty())
}

struct StrCollect(Vec<(u32, u32)>);
impl<'a> Visit<'a> for StrCollect {
    fn visit_string_literal(&mut self, it: &StringLiteral<'a>) {
        self.0.push((it.span.start, it.span.end));
    }
    fn visit_template_literal(&mut self, it: &TemplateLiteral<'a>) {
        self.0.push((it.span.start, it.span.end));
        walk::walk_template_literal(self, it);
    }
}

impl<'s, 'a> Visit<'a> for V<'s, 'a> {
    fn visit_import_declaration(&mut self, it: &ImportDeclaration<'a>) {
        if let Some(specs) = &it.specifiers {
            for s in specs {
                match s {
                    ImportDeclarationSpecifier::ImportSpecifier(x) => {
                        self.written.insert(x.local.name.to_string());
                    }
                    ImportDeclarationSpecifier::ImportDefaultSpecifier(x) => {
                        self.written.insert(x.local.name.to_string());
                    }
                    ImportDeclarationSpecifier::ImportNamespaceSpecifier(x) => {
                        self.written.insert(x.local.name.to_string());
                    }
                }
            }
        }
    }
    fn visit_identifier_name(&mut self, it: &IdentifierName<'a>) {
        self.written.insert(it.name.to_string());
    }
    fn visit_binding_identifier(&mut self, it: &BindingIdentifier<'a>) {
        self.written.insert(it.name.to_string());
    }
    fn visit_label_identifier(&mut self, it: &LabelIdentifier<'a>) {
        self.written.insert(it.name.to_string());
    }
    fn visit_jsx_identifier(&mut self, it: &JSXIdentifier<'a>) {
        self.written.insert(it.name.to_string());
    }
    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        self.written.insert(it.name.to_string());
        if let Some(s) = self.sym_of(it) {
            if self.demo.contains(&s) {
                self.fail(unsafe_demo(&format!("{} is used as a value, not only as a JSX element", it.name)));
            }
        }
    }
    fn visit_string_literal(&mut self, it: &StringLiteral<'a>) {
        self.all_strings.push((it.span.start, it.span.end));
        if it.value.as_str() == Some(DEMO_CONTENT_MODULE) {
            self.fail(unsafe_demo(
                "it is used outside a static import (a re-export, dynamic import, require, or string value)",
            ));
        }
    }
    fn visit_template_literal(&mut self, it: &TemplateLiteral<'a>) {
        self.all_strings.push((it.span.start, it.span.end));
        if it.quasis.iter().any(|q| q.value.cooked.as_ref().map_or(false, |c| c.as_str().map_or(false, |x| x.contains(DEMO_CONTENT_MODULE)))) {
            self.fail(unsafe_demo("it is used outside a static import"));
        }
        walk::walk_template_literal(self, it);
    }
    fn visit_jsx_element(&mut self, it: &JSXElement<'a>) {
        if let JSXElementName::IdentifierReference(id) = &it.opening_element.name {
            if let Some(s) = self.sym_of(id) {
                if self.demo.contains(&s) {
                    let name = id.name.to_string();
                    let content: Vec<&JSXChild> = it.children.iter().filter(|c| !whitespace_text(c)).collect();
                    let wrapped = if content.is_empty() {
                        Ok(None)
                    } else if content.len() == 1 && matches!(content[0], JSXChild::Element(_) | JSXChild::Fragment(_)) {
                        let sp = content[0].span();
                        Ok(Some((sp.start, sp.end)))
                    } else {
                        Err(unsafe_demo(&format!("<{name}> has children other than one element")))
                    };
                    let mut sc = StrCollect(Vec::new());
                    sc.visit_jsx_element(it);
                    let props = prop_reads(self, &it.opening_element, &name);
                    self.elems.push(Elem {
                        start: it.span.start,
                        end: it.span.end,
                        open_start: it.opening_element.span.start,
                        open_end: it.opening_element.span.end,
                        name,
                        scope: self.scope_of(id),
                        props,
                        wrapped,
                        has_children: !content.is_empty(),
                        strings: sc.0,
                    });
                }
            }
        }
        walk::walk_jsx_element(self, it);
    }
    fn visit_jsx_opening_element(&mut self, it: &JSXOpeningElement<'a>) {
        match &it.name {
            JSXElementName::IdentifierReference(id) => {
                self.written.insert(id.name.to_string());
                // A demo name as the tag is the element itself.
            }
            JSXElementName::MemberExpression(m) => {
                let mut obj = &m.object;
                loop {
                    match obj {
                        JSXMemberExpressionObject::MemberExpression(inner) => obj = &inner.object,
                        JSXMemberExpressionObject::IdentifierReference(id) => {
                            if let Some(s) = self.sym_of(id) {
                                if self.demo.contains(&s) {
                                    self.fail(unsafe_demo(&format!("{} is used as a namespace", id.name)));
                                }
                            }
                            break;
                        }
                        _ => break,
                    }
                }
                walk::walk_jsx_member_expression(self, m);
            }
            other => walk::walk_jsx_element_name(self, other),
        }
        for a in &it.attributes {
            self.visit_jsx_attribute_item(a);
        }
        if let Some(t) = &it.type_arguments {
            self.visit_ts_type_parameter_instantiation(t);
        }
    }
    fn visit_jsx_closing_element(&mut self, it: &JSXClosingElement<'a>) {
        if let JSXElementName::IdentifierReference(id) = &it.name {
            self.written.insert(id.name.to_string());
        }
    }
}

fn is_exported(sem: &Semantic, sym: SymbolId) -> bool {
    let nodes = sem.nodes();
    let decl = sem.scoping().symbol_declaration(sym);
    let mut id = decl;
    use oxc::ast::AstKind;
    if matches!(nodes.get_node(id).kind(), AstKind::VariableDeclarator(_)) {
        id = nodes.parent_id(id);
    }
    let p = nodes.parent_kind(id);
    matches!(p, AstKind::ExportNamedDeclaration(_) | AstKind::ExportDefaultDeclaration(_))
}

/// Spans of every reference to a symbol.
fn ref_spans(sem: &Semantic, sym: SymbolId) -> Vec<(u32, u32)> {
    sem.scoping()
        .get_resolved_reference_ids(sym)
        .iter()
        .map(|r| {
            let n = sem.scoping().get_reference(*r).node_id();
            let sp = sem.nodes().get_node(n).kind().span();
            (sp.start, sp.end)
        })
        .collect()
}

fn unique_name(base: &str, written: &HashSet<String>) -> String {
    let mut name = base.to_string();
    let mut n = 2;
    while written.contains(&name) {
        name = format!("{base}{n}");
        n += 1;
    }
    name
}

/// `replaceDemoContent`: (source, demoContentReplaced).
pub fn replace_demo_content(source: &str) -> Result<(String, usize), String> {
    if !source.contains(DEMO_CONTENT_MODULE) {
        return Ok((source.to_string(), 0));
    }
    let alloc = Allocator::default();
    let ret = Parser::new(&alloc, source, SourceType::tsx()).parse();
    if ret.diagnostics.has_errors() {
        let msg = ret.diagnostics.errors().next().map(|e| e.message.to_string()).unwrap_or_default();
        return Err(unsafe_demo(&format!("the source does not parse ({msg})")));
    }
    let program = ret.program;
    let sem_ret = SemanticBuilder::new().with_build_nodes(true).build(&program);
    let sem = sem_ret.semantic;

    let mut demo_imports: Vec<(u32, u32)> = Vec::new();
    let mut demo: HashSet<SymbolId> = HashSet::new();
    let mut text_imports: Vec<(String, Option<SymbolId>)> = Vec::new();
    for stmt in &program.body {
        let Statement::ImportDeclaration(imp) = stmt else { continue };
        let src = imp.source.value.as_str().unwrap_or("");
        if src == DEMO_CONTENT_MODULE {
            if imp.import_kind.is_type() {
                return Err(unsafe_demo("it is imported as a type"));
            }
            if let Some(specs) = &imp.specifiers {
                for s in specs {
                    match s {
                        ImportDeclarationSpecifier::ImportSpecifier(x) if !x.import_kind.is_type() => {
                            if let Some(id) = x.local.symbol_id.get() {
                                demo.insert(id);
                            }
                        }
                        _ => {
                            return Err(unsafe_demo(
                                "only named value imports can be replaced; import each element by name",
                            ))
                        }
                    }
                }
            }
            demo_imports.push((imp.span.start, imp.span.end));
        } else if (src == TEXT_MODULE || src == "@astryxdesign/core") && !imp.import_kind.is_type() {
            if let Some(specs) = &imp.specifiers {
                for s in specs {
                    if let ImportDeclarationSpecifier::ImportSpecifier(x) = s {
                        if !x.import_kind.is_type() && x.imported.name() == "Text" {
                            text_imports.push((x.local.name.to_string(), x.local.symbol_id.get()));
                        }
                    }
                }
            }
        }
    }

    let mut v = V { sem: &sem, demo, elems: Vec::new(), err: None, written: HashSet::new(), all_strings: Vec::new() };
    v.visit_program(&program);
    if let Some(e) = v.err.take() {
        return Err(e);
    }
    let elems = std::mem::take(&mut v.elems);

    // Wrappers first: each is replaced by the one element it holds.
    let mut wrappers: Vec<&Elem> = Vec::new();
    for e in &elems {
        match &e.wrapped {
            Err(m) => return Err(m.clone()),
            Ok(Some(_)) => wrappers.push(e),
            Ok(None) => {}
        }
    }
    if !wrappers.is_empty() {
        let in_tag = |s: (u32, u32)| wrappers.iter().any(|w| w.open_start <= s.0 && s.1 <= w.open_end);
        for w in &wrappers {
            let reads = w.props.clone()?;
            for (name, sym) in reads {
                let Some(sym) = sym else { continue };
                if is_exported(&sem, sym) {
                    continue;
                }
                if ref_spans(&sem, sym).into_iter().all(in_tag) {
                    return Err(unsafe_demo(&format!(
                        "<{}> reads {name}, and nothing else in the file reads it, so the copy would leave it unused",
                        w.name
                    )));
                }
            }
        }
        let mut outer: Vec<&&Elem> = wrappers
            .iter()
            .filter(|w| !wrappers.iter().any(|o| !std::ptr::eq(*o, **w) && o.start <= w.start && w.end <= o.end))
            .collect();
        outer.sort_by(|a, b| b.start.cmp(&a.start));
        let mut output = source.to_string();
        for w in outer {
            let child = dedented_child(source, w);
            output = format!("{}{}{}", &output[..w.start as usize], child, &output[w.end as usize..]);
        }
        return replace_demo_content(&output);
    }

    let replaced = |s: (u32, u32)| elems.iter().any(|e| e.start <= s.0 && s.1 <= e.end);
    for e in &elems {
        let reads = e.props.clone()?;
        if e.has_children {
            return Err(unsafe_demo(&format!("<{}> has children", e.name)));
        }
        for (name, sym) in reads {
            let Some(sym) = sym else { continue };
            if is_exported(&sem, sym) {
                continue;
            }
            if ref_spans(&sem, sym).into_iter().all(replaced) {
                return Err(unsafe_demo(&format!(
                    "<{}> reads {name}, and nothing else in the file reads it, so the copy would leave it unused",
                    e.name
                )));
            }
        }
    }

    let reused = if elems.is_empty() {
        None
    } else {
        text_imports
            .iter()
            .find(|(name, sym)| {
                elems.iter().all(|e| {
                    sem.scoping().find_binding(e.scope, oxc::str::Ident::from(name.as_str())) == *sym
                })
            })
            .map(|(n, _)| n.clone())
    };
    let text_name = reused.clone().unwrap_or_else(|| {
        if v.written.contains("Text") {
            unique_name("AstryxText", &v.written)
        } else {
            "Text".into()
        }
    });
    let text_import = if !elems.is_empty() && reused.is_none() {
        let spec = if text_name == "Text" { "Text".to_string() } else { format!("Text as {text_name}") };
        format!("import {{{spec}}} from '{TEXT_MODULE}';\n")
    } else {
        String::new()
    };
    let placeholder = format!("<{text_name}>{PLACEHOLDER_TEXT}</{text_name}>");
    let mut edits: Vec<(usize, usize, String)> =
        elems.iter().map(|e| (e.start as usize, e.end as usize, placeholder.clone())).collect();
    for (i, (s, e)) in demo_imports.iter().enumerate() {
        let mut end = *e as usize;
        if source.as_bytes().get(end) == Some(&b'\n') {
            end += 1;
        }
        edits.push((*s as usize, end, if i == 0 { text_import.clone() } else { String::new() }));
    }
    edits.sort_by(|a, b| b.0.cmp(&a.0));
    let mut output = source.to_string();
    for (s, e, t) in edits {
        output = format!("{}{}{}", &output[..s], t, &output[e..]);
    }
    Ok((output, elems.len()))
}

fn indent_of_line(source: &str, offset: usize) -> usize {
    let line_start = source[..offset].rfind('\n').map_or(0, |i| i + 1);
    source[line_start..].bytes().take_while(|b| *b == b' ' || *b == b'\t').count()
}

fn dedented_child(source: &str, w: &Elem) -> String {
    let (cs, ce) = match w.wrapped {
        Ok(Some(s)) => (s.0 as usize, s.1 as usize),
        _ => return String::new(),
    };
    let depth = indent_of_line(source, cs) as isize - indent_of_line(source, w.start as usize) as isize;
    let depth = depth.max(0) as usize;
    let mut line_start = cs;
    let mut out: Vec<String> = Vec::new();
    for (i, line) in source[cs..ce].split('\n').enumerate() {
        let start = line_start;
        line_start += line.len() + 1;
        if i == 0 || w.strings.iter().any(|(a, b)| (*a as usize) < start && start < *b as usize) {
            out.push(line.to_string());
            continue;
        }
        let n = line.bytes().take(depth).take_while(|b| *b == b' ' || *b == b'\t').count();
        out.push(line[n..].to_string());
    }
    out.join("\n")
}
