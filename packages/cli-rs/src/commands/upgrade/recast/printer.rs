//! recast `printer`: reprint changed nodes, reuse original text elsewhere.

use super::ast::*;
use super::lines::{cat, concat, Lines, Part, PrintOpts};
use super::path::{PName, Path};
use super::patcher::{find_array_reprints, find_reprints, Patcher};
use super::types::*;
use crate::lcat;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Quote {
    Double,
    Single,
    Auto,
}

#[derive(Clone, Debug)]
pub struct Config {
    pub tab_width: usize,
    pub explicit_tab_width: bool,
    pub wrap_column: usize,
    pub quote: Quote,
    pub object_curly_spacing: bool,
    pub array_bracket_spacing: bool,
    pub trailing_comma: bool,
    pub arrow_parens_always: bool,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            tab_width: 4,
            explicit_tab_width: false,
            wrap_column: 74,
            quote: Quote::Double,
            object_curly_spacing: true,
            array_bracket_spacing: false,
            trailing_comma: false,
            arrow_parens_always: false,
        }
    }
}

#[derive(Clone, Copy, Default)]
pub struct POpts {
    pub include_comments: bool,
    pub avoid_root_parens: bool,
}

pub struct Printer<'a> {
    pub ast: &'a Ast,
    pub config: Config,
    /// Node whose `extra.parenthesized` is treated as false (ReturnStatement JSX).
    pub unparen: Option<NodeId>,
}

pub fn to_source(ast: &Ast, root: NodeId, config: Config) -> String {
    let mut p = Printer { ast, config, unparen: None };
    let mut path = Path::new(V::Node(root));
    let lines = p.print(&mut path, POpts { include_comments: true, avoid_root_parens: false });
    lines.to_string_opts(&PrintOpts { tab_width: 4, use_tabs: false, reuse_whitespace: true, line_terminator: "\n".into() })
}

pub fn fs(s: &str) -> Lines {
    Lines::from_str(s)
}

impl<'a> Printer<'a> {
    pub fn tw(&self) -> i64 {
        self.config.tab_width as i64
    }

    fn fso(&self, s: &str) -> Lines {
        Lines::from_str_tab(s, self.config.tab_width)
    }

    pub fn print(&mut self, path: &mut Path, opts: POpts) -> Lines {
        if opts.include_comments {
            return self.print_comments(path, POpts { include_comments: false, ..opts });
        }
        let old_tw = self.config.tab_width;
        if !self.config.explicit_tab_width {
            if let Some(n) = path.node(self.ast) {
                if let Some(loc) = &self.ast.node(n).loc {
                    self.config.tab_width = self.ast.lines[loc.lines_id].guess_tab_width();
                }
            }
        }
        let lines = match self.reprint(path) {
            Some(l) => l,
            None => self.generic_print(path, opts),
        };
        self.config.tab_width = old_tw;
        lines
    }

    /// print with the default child options (comments on, root parens allowed)
    pub fn p(&mut self, path: &mut Path) -> Lines {
        self.print(path, POpts { include_comments: true, avoid_root_parens: false })
    }

    pub fn call(&mut self, path: &mut Path, key: &'static str) -> Lines {
        let node = path.value().as_node().unwrap();
        let v = self.ast.get(node, key).clone();
        path.push(PName::Key(key), v);
        let l = self.p(path);
        path.pop();
        l
    }

    pub fn call2(&mut self, path: &mut Path, k1: &'static str, k2: &'static str) -> Lines {
        let node = path.value().as_node().unwrap();
        let v1 = self.ast.get(node, k1).clone();
        path.push(PName::Key(k1), v1.clone());
        let v2 = match &v1 {
            V::Node(c) => self.ast.get(*c, k2).clone(),
            _ => V::Undef,
        };
        path.push(PName::Key(k2), v2);
        let l = self.p(path);
        path.pop();
        path.pop();
        l
    }

    pub fn map(&mut self, path: &mut Path, key: &'static str) -> Vec<Lines> {
        let node = path.value().as_node().unwrap();
        let arr = self.ast.get(node, key).clone();
        let items = match &arr {
            V::Arr(a) => a.clone(),
            _ => vec![],
        };
        path.push(PName::Key(key), arr);
        let mut out = Vec::new();
        for (i, it) in items.into_iter().enumerate() {
            path.push(PName::Idx(i), it);
            out.push(self.p(path));
            path.pop();
        }
        path.pop();
        out
    }

    /// Reprinter: Some(lines) when the node can be patched from its original.
    fn reprint(&mut self, path: &mut Path) -> Option<Lines> {
        let ast = self.ast;
        let node = path.value().as_node()?;
        let orig = ast.node(node).original?;
        let oloc = ast.node(orig).loc.clone()?;
        let lines = ast.lines[oloc.lines_id].clone();
        let mut reprints = Vec::new();
        if !find_reprints(ast, path, &mut reprints) {
            return None;
        }
        let mut patcher = Patcher::new((*lines).clone());
        for mut r in reprints {
            let new_node = r.new_path.value().as_node().unwrap();
            let old_node = r.old_path.value().as_node().unwrap();
            let old_loc = ast.node(old_node).loc.clone().unwrap();
            let need_comments = !self.try_reprint_comments(&mut patcher, new_node, old_node);
            if need_comments {
                delete_comments(ast, &mut patcher, old_node, &lines);
            }
            let avoid = ast.ty(old_node) == ast.ty(new_node) && r.old_path.has_parens(ast);
            let mut new_lines = self.print(&mut r.new_path, POpts { include_comments: need_comments, avoid_root_parens: avoid }).indent_tail(old_loc.indent as i64);
            let nls = needs_leading_space(&lines, old_loc.start, &new_lines);
            let nts = needs_trailing_space(&lines, old_loc.end, &new_lines);
            if nls || nts {
                let mut parts = Vec::new();
                if nls {
                    parts.push(fs(" "));
                }
                parts.push(new_lines);
                if nts {
                    parts.push(fs(" "));
                }
                new_lines = concat(&parts);
            }
            patcher.replace(old_loc.start, old_loc.end, new_lines);
        }
        let patched = patcher.get(oloc.start, oloc.end).indent_tail(-(oloc.indent as i64));
        if path.needs_parens(ast, false, self.unparen) {
            return Some(lcat!["(", patched, ")"]);
        }
        Some(patched)
    }

    fn try_reprint_comments(&mut self, patcher: &mut Patcher, new_node: NodeId, old_node: NodeId) -> bool {
        let ast = self.ast;
        let nc = ast.get(new_node, "comments");
        let oc = ast.get(old_node, "comments");
        let has = |v: &V| matches!(v, V::Arr(_));
        if !has(nc) && !has(oc) {
            return true;
        }
        let surround = |v: &V| -> V {
            V::Arr(match v {
                V::Arr(a) => a.iter().filter(|c| c.as_node().map(|c| ast.flag(c, "leading") || ast.flag(c, "trailing")).unwrap_or(false)).cloned().collect(),
                _ => vec![],
            })
        };
        let mut np = Path::new(V::Node(new_node));
        let mut op = Path::new(V::Node(old_node));
        np.push(PName::Key("comments"), surround(nc));
        op.push(PName::Key("comments"), surround(oc));
        let mut reprints = Vec::new();
        let able = find_array_reprints(ast, &mut np, &mut op, &mut reprints);
        if able && !reprints.is_empty() {
            for mut r in reprints {
                let oldc = r.old_path.value().as_node().unwrap();
                let l = ast.node(oldc).loc.clone().unwrap();
                let printed = self.print(&mut r.new_path, POpts::default()).indent_tail(l.indent as i64);
                patcher.replace(l.start, l.end, printed);
            }
        }
        able
    }

    pub fn print_comments(&mut self, path: &mut Path, opts: POpts) -> Lines {
        let ast = self.ast;
        let inner = self.print(path, opts);
        let value = match path.value() {
            V::Node(n) if !is_comment(ast.ty(*n)) => *n,
            _ => return inner,
        };
        let comments = match ast.get(value, "comments") {
            V::Arr(a) if !a.is_empty() => a.clone(),
            _ => return inner,
        };
        let mut leading: Vec<Lines> = Vec::new();
        let mut trailing: Vec<Lines> = vec![inner];
        let is_stmt = is_statement(ast.ty(value));
        path.push(PName::Key("comments"), V::Arr(comments.clone()));
        for (i, c) in comments.iter().enumerate() {
            let cid = c.as_node().unwrap();
            let l = ast.flag(cid, "leading");
            let t = ast.flag(cid, "trailing");
            let cty = ast.ty(cid);
            path.push(PName::Idx(i), c.clone());
            if l || (t && !(is_stmt || cty == "Block" || cty == "CommentBlock")) {
                let printed = self.print_leading_comment(path, cid);
                leading.push(printed);
            } else if t {
                let printed = self.print_trailing_comment(path, cid);
                trailing.push(printed);
            }
            path.pop();
        }
        path.pop();
        leading.extend(trailing);
        concat(&leading)
    }

    fn print_leading_comment(&mut self, path: &mut Path, c: NodeId) -> Lines {
        let ast = self.ast;
        let mut parts = vec![self.print(path, POpts::default())];
        if ast.flag(c, "trailing") {
            parts.push(fs("\n"));
        } else if let Some(loc) = &ast.node(c).loc {
            let lines = &ast.lines[loc.lines_id];
            let to = lines.skip_spaces(Some(loc.end), false).unwrap_or(lines.last_pos());
            let ts = lines.slice(loc.end, to);
            if ts.len() == 1 {
                parts.push(ts);
            } else {
                parts.push(fs(&"\n".repeat(ts.len() - 1)));
            }
        } else {
            parts.push(fs("\n"));
        }
        concat(&parts)
    }

    fn print_trailing_comment(&mut self, path: &mut Path, c: NodeId) -> Lines {
        let ast = self.ast;
        let mut parts = Vec::new();
        if let Some(loc) = &ast.node(c).loc {
            let lines = &ast.lines[loc.lines_id];
            let from = lines.skip_spaces(Some(loc.start), true).unwrap_or(lines.first_pos());
            let ls = lines.slice(from, loc.start);
            if ls.len() == 1 {
                parts.push(ls);
            } else {
                parts.push(fs(&"\n".repeat(ls.len() - 1)));
            }
        }
        parts.push(self.print(path, POpts::default()));
        concat(&parts)
    }

    fn generic_print(&mut self, path: &mut Path, opts: POpts) -> Lines {
        let no_parens = self.generic_print_no_parens(path);
        let node = match path.value() {
            V::Node(n) => *n,
            _ => return no_parens,
        };
        if no_parens.is_empty() {
            return no_parens;
        }
        let mut parts = Vec::new();
        let deco = self.print_decorators(path, node);
        let mut add_parens = false;
        if deco.is_empty() {
            if !opts.avoid_root_parens {
                add_parens = path.needs_parens(self.ast, false, self.unparen);
            }
        } else {
            parts.push(deco);
        }
        if add_parens {
            parts.insert(0, fs("("));
        }
        parts.push(no_parens);
        if add_parens {
            parts.push(fs(")"));
        }
        concat(&parts)
    }

    fn print_decorators(&mut self, path: &mut Path, node: NodeId) -> Lines {
        let ast = self.ast;
        let mut parts = Vec::new();
        let decos = ast.list(node, "decorators");
        let parent_is_export = path.name() == PName::Key("declaration") && path.parent_node(ast).map(|p| is_export_decl(ast.ty(p))).unwrap_or(false);
        if !decos.is_empty() && !parent_is_export {
            for (i, d) in decos.iter().enumerate() {
                path.push(PName::Key("decorators"), ast.get(node, "decorators").clone());
                path.push(PName::Idx(i), V::Node(*d));
                parts.push(self.p(path));
                path.pop();
                path.pop();
                parts.push(fs("\n"));
            }
        } else if is_export_decl(ast.ty(node)) {
            if let Some(decl) = ast.child(node, "declaration") {
                let ds = ast.list(decl, "decorators");
                for (i, d) in ds.iter().enumerate() {
                    path.push(PName::Key("declaration"), V::Node(decl));
                    path.push(PName::Key("decorators"), ast.get(decl, "decorators").clone());
                    path.push(PName::Idx(i), V::Node(*d));
                    parts.push(self.p(path));
                    path.pop();
                    path.pop();
                    path.pop();
                    parts.push(fs("\n"));
                }
            }
        }
        concat(&parts)
    }

    pub fn node_str(&self, s: &str) -> String {
        node_str(s, self.config.quote)
    }

    pub fn print_statement_sequence(&mut self, path: &mut Path, key: &'static str) -> Lines {
        let ast = self.ast;
        let node = path.value().as_node().unwrap();
        let arr = ast.get(node, key).clone();
        let items = match &arr {
            V::Arr(a) => a.clone(),
            _ => vec![],
        };
        path.push(PName::Key(key), arr);
        let mut filtered: Vec<(NodeId, Lines)> = Vec::new();
        for (i, it) in items.iter().enumerate() {
            let st = match it.as_node() {
                Some(s) => s,
                None => continue,
            };
            if ast.is(st, "EmptyStatement") && !matches!(ast.get(st, "comments"), V::Arr(a) if !a.is_empty()) {
                continue;
            }
            path.push(PName::Idx(i), it.clone());
            let printed = self.p(path);
            path.pop();
            filtered.push((st, printed));
        }
        path.pop();
        let len = filtered.len();
        let mut parts: Vec<Lines> = Vec::new();
        let mut prev_trailing: Option<String> = None;
        for (i, (st, printed)) in filtered.into_iter().enumerate() {
            let multi = printed.len() > 1;
            let not_first = i > 0;
            let not_last = i < len - 1;
            let true_loc = true_loc(ast, st);
            let lines = ast.node(st).loc.as_ref().map(|l| ast.lines[l.lines_id].clone());
            let leading = if not_first {
                if let (Some((s, _)), Some(lines)) = (true_loc, &lines) {
                    let before = lines.skip_spaces(Some(s), true);
                    let bl = before.map(|p| p.line).unwrap_or(1);
                    "\n".repeat(s.line - bl)
                } else if multi {
                    "\n\n".into()
                } else {
                    "\n".into()
                }
            } else {
                String::new()
            };
            let trailing = if not_last {
                if let (Some((_, e)), Some(lines)) = (true_loc, &lines) {
                    let after = lines.skip_spaces(Some(e), false);
                    let al = after.map(|p| p.line).unwrap_or(lines.len());
                    "\n".repeat(al - e.line)
                } else if multi {
                    "\n\n".into()
                } else {
                    "\n".into()
                }
            } else {
                String::new()
            };
            parts.push(max_space(prev_trailing.as_deref(), &leading));
            parts.push(printed);
            if not_last {
                prev_trailing = Some(trailing);
            } else if !trailing.is_empty() {
                parts.push(fs(&trailing));
            }
        }
        concat(&parts)
    }

    pub fn print_function_params(&mut self, path: &mut Path) -> Lines {
        let ast = self.ast;
        let fun = path.value().as_node().unwrap();
        let (key, params) = if ast.has(fun, "params") && matches!(ast.get(fun, "params"), V::Arr(_)) {
            ("params", ast.list(fun, "params"))
        } else if matches!(ast.get(fun, "parameters"), V::Arr(_)) {
            ("parameters", ast.list(fun, "parameters"))
        } else {
            ("params", vec![])
        };
        let printed = if params.is_empty() && !matches!(ast.get(fun, key), V::Arr(_)) { vec![] } else { self.map(path, key) };
        let joined = fs(", ").join(&printed);
        if joined.len() > 1 || joined.get_line_length(1) > self.config.wrap_column {
            let mut j = fs(",\n").join(&printed);
            let last_rest = params.last().map(|p| ast.is(*p, "RestElement")).unwrap_or(false);
            if self.config.trailing_comma && !last_rest {
                j = lcat![j, ",\n"];
            } else {
                j = lcat![j, "\n"];
            }
            return lcat!["\n", j.indent(self.tw())];
        }
        joined
    }

    pub fn print_arguments_list(&mut self, path: &mut Path) -> Lines {
        let printed = self.map(path, "arguments");
        let joined = fs(", ").join(&printed);
        if joined.get_line_length(1) > self.config.wrap_column {
            let j = fs(",\n").join(&printed);
            return lcat!["(\n", j.indent(self.tw()), if self.config.trailing_comma { ",\n)" } else { "\n)" }];
        }
        lcat!["(", joined, ")"]
    }

    pub fn print_method(&mut self, path: &mut Path) -> Lines {
        let ast = self.ast;
        let node = path.value().as_node().unwrap();
        let kind = ast.str_of(node, "kind").unwrap_or("").to_string();
        let mut parts: Vec<Part> = Vec::new();
        let value = ast.child(node, "value").filter(|v| ast.is(*v, "FunctionExpression"));
        let nv = value.unwrap_or(node);
        for m in class_member_modifiers(ast, node) {
            parts.push(m.into());
        }
        if ast.flag(nv, "async") {
            parts.push("async ".into());
        }
        if ast.flag(nv, "generator") {
            parts.push("*".into());
        }
        if kind == "get" || kind == "set" {
            parts.push(kind.clone().into());
            parts.push(" ".into());
        }
        let mut key = self.call(path, "key");
        if ast.flag(node, "computed") {
            key = lcat!["[", key, "]"];
        }
        parts.push(key.into());
        if ast.flag(node, "optional") {
            parts.push("?".into());
        }
        if value.is_none() {
            parts.push(self.call(path, "typeParameters").into());
            parts.push("(".into());
            parts.push(self.print_function_params(path).into());
            parts.push(")".into());
            parts.push(self.call(path, "returnType").into());
            if ast.child(node, "body").is_some() {
                parts.push(" ".into());
                parts.push(self.call(path, "body").into());
            } else {
                parts.push(";".into());
            }
        } else {
            let v = value.unwrap();
            parts.push(self.call2(path, "value", "typeParameters").into());
            parts.push("(".into());
            path.push(PName::Key("value"), V::Node(v));
            let fp = self.print_function_params(path);
            path.pop();
            parts.push(fp.into());
            parts.push(")".into());
            parts.push(self.call2(path, "value", "returnType").into());
            if ast.child(v, "body").is_some() {
                parts.push(" ".into());
                parts.push(self.call2(path, "value", "body").into());
            } else {
                parts.push(";".into());
            }
        }
        cat(parts)
    }

    pub fn adjust_clause(&self, clause: Lines) -> Lines {
        if clause.len() > 1 {
            return lcat![" ", clause];
        }
        lcat!["\n", maybe_add_semicolon(clause).indent(self.tw())]
    }

    pub fn print_import_assertions(&mut self, path: &mut Path) -> Lines {
        let ast = self.ast;
        let n = path.value().as_node().unwrap();
        let has_assertions = matches!(ast.get(n, "assertions"), V::Arr(_));
        let kw = ast.str_of(n, "importAttributesKeyword").map(|s| s.to_string());
        let arr_len = ast.list(n, "assertions").len();
        if has_assertions && (arr_len > 0 || kw.is_some()) {
            let keyword = if kw.as_deref() == Some("with") { " with {" } else { " assert {" };
            let printed = self.map(path, "assertions");
            if printed.is_empty() {
                return lcat![keyword, "}"];
            }
            let flat = fs(", ").join(&printed);
            if flat.len() > 1 || flat.get_line_length(1) > self.config.wrap_column {
                return lcat![keyword, "\n", fs(",\n").join(&printed).indent(self.tw()), "\n}"];
            }
            return lcat![keyword, " ", flat, " }"];
        }
        fs("")
    }

    pub fn fso_pub(&self, s: &str) -> Lines {
        self.fso(s)
    }
}

pub fn class_member_modifiers(ast: &Ast, node: NodeId) -> Vec<String> {
    let mut parts = Vec::new();
    if ast.flag(node, "declare") {
        parts.push("declare ".into());
    }
    let access = ast.str_of(node, "accessibility").or_else(|| ast.str_of(node, "access"));
    if let Some(a) = access {
        parts.push(a.to_string());
        parts.push(" ".into());
    }
    if ast.flag(node, "static") {
        parts.push("static ".into());
    }
    if ast.flag(node, "override") {
        parts.push("override ".into());
    }
    if ast.flag(node, "abstract") {
        parts.push("abstract ".into());
    }
    if ast.flag(node, "readonly") {
        parts.push("readonly ".into());
    }
    parts
}

pub fn is_export_decl(ty: &str) -> bool {
    matches!(ty, "ExportDeclaration" | "ExportDefaultDeclaration" | "ExportDefaultSpecifier" | "DeclareExportDeclaration" | "ExportNamedDeclaration" | "ExportAllDeclaration")
}

fn true_loc(ast: &Ast, id: NodeId) -> Option<(super::lines::Pos, super::lines::Pos)> {
    let n = ast.node(id);
    let loc = n.loc.as_ref()?;
    let lines = &ast.lines[loc.lines_id];
    let mut start = loc.start;
    let mut end = loc.end;
    if let Some(decl) = ast.child(id, "declaration") {
        if is_export_decl(n.ty) {
            for d in ast.list(decl, "decorators") {
                if let Some(dl) = &ast.node(d).loc {
                    if super::lines::compare_pos(dl.start, start).is_lt() {
                        start = dl.start;
                    }
                    if super::lines::compare_pos(end, dl.end).is_lt() {
                        end = dl.end;
                    }
                }
            }
        }
    }
    if super::lines::compare_pos(start, end).is_lt() {
        if let Some(p) = lines.skip_spaces(Some(start), false) {
            start = p;
        }
        if super::lines::compare_pos(start, end).is_lt() {
            if let Some(p) = lines.skip_spaces(Some(end), true) {
                end = p;
            }
        }
    }
    if let V::Arr(cs) = ast.get(id, "comments") {
        for c in cs {
            if let Some(cl) = c.as_node().and_then(|c| ast.node(c).loc.as_ref()) {
                if super::lines::compare_pos(cl.start, start).is_lt() {
                    start = cl.start;
                }
                if super::lines::compare_pos(end, cl.end).is_lt() {
                    end = cl.end;
                }
            }
        }
    }
    Some((start, end))
}

fn max_space(s1: Option<&str>, s2: &str) -> Lines {
    let s1 = s1.unwrap_or("");
    if s1.is_empty() && s2.is_empty() {
        return fs("");
    }
    if s1.is_empty() {
        return fs(s2);
    }
    if s2.is_empty() {
        return fs(s1);
    }
    let a = fs(s1);
    let b = fs(s2);
    if b.len() > a.len() {
        b
    } else {
        a
    }
}

fn delete_comments(ast: &Ast, patcher: &mut Patcher, node: NodeId, lines: &Lines) {
    if let V::Arr(cs) = ast.get(node, "comments") {
        for c in cs {
            let c = c.as_node().unwrap();
            let cl = ast.node(c).loc.clone().unwrap();
            if ast.flag(c, "leading") {
                let end = lines.skip_spaces(Some(cl.end), false).unwrap_or(cl.end);
                patcher.replace(cl.start, end, fs(""));
            } else if ast.flag(c, "trailing") {
                let start = lines.skip_spaces(Some(cl.start), true).unwrap_or(cl.start);
                patcher.replace(start, cl.end, fs(""));
            }
        }
    }
}

fn risky(c: Option<u16>) -> bool {
    match c {
        Some(c) if c < 128 => {
            let ch = c as u8 as char;
            ch.is_ascii_alphanumeric() || ch == '_' || ch == '$'
        }
        _ => false,
    }
}

fn needs_leading_space(old: &Lines, start: super::lines::Pos, new_lines: &Lines) -> bool {
    let mut p = start;
    let before = if old.prev_pos(&mut p, false) { old.char_at(p) } else { None };
    risky(before) && risky(new_lines.first_char())
}

fn needs_trailing_space(old: &Lines, end: super::lines::Pos, new_lines: &Lines) -> bool {
    let after = old.char_at(end);
    risky(new_lines.last_char()) && risky(after)
}

pub fn maybe_add_semicolon(lines: Lines) -> Lines {
    match lines.last_non_space_char() {
        Some(c) if c == b'\n' as u16 || c == b'}' as u16 || c == b';' as u16 => lines,
        _ => lcat![lines, ";"],
    }
}

pub fn js_safe_stringify(s: &str) -> String {
    let mut out = String::from("\"");
    let units: Vec<u16> = s.encode_utf16().collect();
    let mut i = 0;
    while i < units.len() {
        let c = units[i];
        match c {
            0x22 => out.push_str("\\\""),
            0x5c => out.push_str("\\\\"),
            0x08 => out.push_str("\\b"),
            0x0c => out.push_str("\\f"),
            0x0a => out.push_str("\\n"),
            0x0d => out.push_str("\\r"),
            0x09 => out.push_str("\\t"),
            0x2028 => out.push_str("\\u2028"),
            0x2029 => out.push_str("\\u2029"),
            c if c < 0x20 => out.push_str(&format!("\\u{:04x}", c)),
            0xd800..=0xdbff if i + 1 < units.len() && (0xdc00..=0xdfff).contains(&units[i + 1]) => {
                out.push_str(&String::from_utf16_lossy(&units[i..i + 2]));
                i += 1;
            }
            0xd800..=0xdfff => out.push_str(&format!("\\u{:04x}", c)),
            c => out.push(char::from_u32(c as u32).unwrap()),
        }
        i += 1;
    }
    out.push('"');
    out
}

fn swap_quotes(s: &str) -> String {
    s.chars().map(|c| if c == '"' { '\'' } else if c == '\'' { '"' } else { c }).collect()
}

pub fn node_str(s: &str, q: Quote) -> String {
    match q {
        Quote::Auto => {
            let double = js_safe_stringify(s);
            let single = swap_quotes(&js_safe_stringify(&swap_quotes(s)));
            if double.encode_utf16().count() > single.encode_utf16().count() {
                single
            } else {
                double
            }
        }
        Quote::Single => swap_quotes(&js_safe_stringify(&swap_quotes(s))),
        Quote::Double => js_safe_stringify(s),
    }
}

/// `getPossibleRaw`
pub fn possible_raw(ast: &Ast, n: NodeId) -> Option<String> {
    let value = ast.get(n, "value");
    let extra = ast.get(n, "extra");
    if let V::Str(raw) = extra.obj_get("raw") {
        if loose_eq(value, extra.obj_get("rawValue")) {
            return Some(raw.to_string());
        }
    }
    if ast.is(n, "Literal") {
        if let V::Str(raw) = ast.get(n, "raw") {
            if loose_eq(value, &V::Str(raw.clone())) {
                return Some(raw.to_string());
            }
        }
    }
    None
}

/// JS `==` for the primitive cases getPossibleRaw meets.
pub fn loose_eq(a: &V, b: &V) -> bool {
    match (a, b) {
        (V::Str(x), V::Str(y)) => x == y,
        (V::Num(x), V::Num(y)) => x == y,
        (V::Bool(x), V::Bool(y)) => x == y,
        (V::Num(x), V::Str(y)) | (V::Str(y), V::Num(x)) => js_to_number(y).map(|n| n == *x).unwrap_or(false),
        (V::Bool(x), other) | (other, V::Bool(x)) => loose_eq(&V::Num(if *x { 1.0 } else { 0.0 }), other),
        (V::Null | V::Undef, V::Null | V::Undef) => true,
        _ => false,
    }
}

fn js_to_number(s: &str) -> Option<f64> {
    let t = super::lines::js_trim(s);
    if t.is_empty() {
        return Some(0.0);
    }
    if let Some(h) = t.strip_prefix("0x").or_else(|| t.strip_prefix("0X")) {
        return i64::from_str_radix(h, 16).ok().map(|v| v as f64);
    }
    if t.contains('_') || t.ends_with('n') {
        return None;
    }
    t.parse::<f64>().ok()
}

pub fn num_to_js(n: f64) -> String {
    crate::json::js_number_to_string(n)
}
