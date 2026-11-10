//! `genericPrintNoParens`: one case per node type, as recast prints it.

use super::ast::*;
use super::lines::{cat, concat, Lines, Part};
use super::path::{PName, Path};
use super::printer::*;

use crate::lcat;

impl<'a> Printer<'a> {
    pub fn generic_print_no_parens(&mut self, path: &mut Path) -> Lines {
        let ast = self.ast;
        let n = match path.value().clone() {
            V::Node(n) => n,
            V::Str(s) => return self.fso_pub(&s),
            V::Undef | V::Null | V::Bool(false) => return fs(""),
            V::Num(x) => return self.fso_pub(&num_to_js(x)),
            _ => return fs(""),
        };
        let ty = ast.ty(n);
        let tw = self.tw();
        let mut parts: Vec<Part> = Vec::new();
        macro_rules! c {
            ($k:expr) => {
                self.call(path, $k)
            };
        }
        match ty {
            "File" => c!("program"),
            "Program" => {
                if matches!(ast.get(n, "directives"), V::Arr(_)) {
                    for (i, d) in ast.list(n, "directives").into_iter().enumerate() {
                        path.push(PName::Key("directives"), ast.get(n, "directives").clone());
                        path.push(PName::Idx(i), V::Node(d));
                        parts.push(self.p(path).into());
                        path.pop();
                        path.pop();
                        parts.push(";\n".into());
                    }
                }
                if ast.child(n, "interpreter").is_some() {
                    parts.push(c!("interpreter").into());
                }
                parts.push(self.print_statement_sequence(path, "body").into());
                cat(parts)
            }
            "Noop" | "EmptyStatement" => fs(""),
            "ExpressionStatement" => lcat![c!("expression"), ";"],
            "ParenthesizedExpression" => lcat!["(", c!("expression"), ")"],
            "BinaryExpression" | "LogicalExpression" | "AssignmentExpression" => {
                let l = c!("left");
                let r = c!("right");
                fs(" ").join(&[l, fs(ast.str_of(n, "operator").unwrap_or("")), r])
            }
            "AssignmentPattern" => lcat![c!("left"), " = ", c!("right")],
            "MemberExpression" | "OptionalMemberExpression" => {
                let obj = c!("object");
                let prop = c!("property");
                let opt = ast.flag(n, "optional");
                if ast.flag(n, "computed") {
                    lcat![obj, if opt { "?.[" } else { "[" }, prop, "]"]
                } else {
                    lcat![obj, if opt { "?." } else { "." }, prop]
                }
            }
            "ChainExpression" => c!("expression"),
            "MetaProperty" => lcat![c!("meta"), ".", c!("property")],
            "Identifier" => {
                let name = ast.name(n).unwrap_or("").to_string();
                lcat![self.fso_pub(&name), if ast.flag(n, "optional") { "?" } else { "" }, c!("typeAnnotation")]
            }
            "SpreadElement" | "SpreadElementPattern" | "RestProperty" | "SpreadProperty" | "SpreadPropertyPattern" | "RestElement" => {
                lcat!["...", c!("argument"), c!("typeAnnotation")]
            }
            "FunctionDeclaration" | "FunctionExpression" | "TSDeclareFunction" => {
                if ast.flag(n, "declare") {
                    parts.push("declare ".into());
                }
                if ast.flag(n, "async") {
                    parts.push("async ".into());
                }
                parts.push("function".into());
                if ast.flag(n, "generator") {
                    parts.push("*".into());
                }
                if ast.child(n, "id").is_some() {
                    parts.push(" ".into());
                    parts.push(c!("id").into());
                    parts.push(c!("typeParameters").into());
                } else if ast.child(n, "typeParameters").is_some() {
                    parts.push(c!("typeParameters").into());
                }
                parts.push("(".into());
                parts.push(self.print_function_params(path).into());
                parts.push(")".into());
                parts.push(c!("returnType").into());
                if ast.child(n, "body").is_some() {
                    parts.push(" ".into());
                    parts.push(c!("body").into());
                }
                cat(parts)
            }
            "ArrowFunctionExpression" => {
                if ast.flag(n, "async") {
                    parts.push("async ".into());
                }
                if ast.child(n, "typeParameters").is_some() {
                    parts.push(c!("typeParameters").into());
                }
                let params = ast.list(n, "params");
                if !self.config.arrow_parens_always
                    && params.len() == 1
                    && !ast.get(n, "rest").as_bool()
                    && ast.is(params[0], "Identifier")
                    && ast.child(params[0], "typeAnnotation").is_none()
                    && ast.child(n, "returnType").is_none()
                {
                    path.push(PName::Key("params"), ast.get(n, "params").clone());
                    path.push(PName::Idx(0), V::Node(params[0]));
                    parts.push(self.p(path).into());
                    path.pop();
                    path.pop();
                } else {
                    parts.push("(".into());
                    parts.push(self.print_function_params(path).into());
                    parts.push(")".into());
                    parts.push(c!("returnType").into());
                }
                parts.push(" => ".into());
                parts.push(c!("body").into());
                cat(parts)
            }
            "MethodDefinition" | "ClassMethod" | "ObjectMethod" | "ClassPrivateMethod" | "TSDeclareMethod" => self.print_method(path),
            "YieldExpression" => {
                parts.push("yield".into());
                if ast.flag(n, "delegate") {
                    parts.push("*".into());
                }
                if ast.child(n, "argument").is_some() {
                    parts.push(" ".into());
                    parts.push(c!("argument").into());
                }
                cat(parts)
            }
            "AwaitExpression" => {
                parts.push("await".into());
                if ast.flag(n, "all") {
                    parts.push("*".into());
                }
                if ast.child(n, "argument").is_some() {
                    parts.push(" ".into());
                    parts.push(c!("argument").into());
                }
                cat(parts)
            }
            "ImportSpecifier" => {
                if let Some(k) = ast.str_of(n, "importKind") {
                    if k != "value" {
                        parts.push(format!("{} ", k).into());
                    }
                }
                if let Some(imp) = ast.child(n, "imported") {
                    parts.push(c!("imported").into());
                    if let Some(local) = ast.child(n, "local") {
                        if ast.name(local) != ast.name(imp) {
                            parts.push(" as ".into());
                            parts.push(c!("local").into());
                        }
                    }
                }
                cat(parts)
            }
            "ExportSpecifier" => {
                if let Some(k) = ast.str_of(n, "exportKind") {
                    if k != "value" {
                        parts.push(format!("{} ", k).into());
                    }
                }
                if let Some(local) = ast.child(n, "local") {
                    parts.push(c!("local").into());
                    if let Some(ex) = ast.child(n, "exported") {
                        if ast.name(ex) != ast.name(local) {
                            parts.push(" as ".into());
                            parts.push(c!("exported").into());
                        }
                    }
                }
                cat(parts)
            }
            "ExportBatchSpecifier" => fs("*"),
            "ImportNamespaceSpecifier" => lcat!["* as ", c!("local")],
            "ImportDefaultSpecifier" => c!("local"),
            "TSExportAssignment" => lcat!["export = ", c!("expression")],
            "ExportDeclaration" | "ExportDefaultDeclaration" | "ExportNamedDeclaration" => self.print_export_declaration(path),
            "ExportAllDeclaration" => {
                parts.push(if ast.str_of(n, "exportKind") == Some("type") { "export type *" } else { "export *" }.into());
                if ast.child(n, "exported").is_some() {
                    parts.push(" as ".into());
                    parts.push(c!("exported").into());
                }
                parts.push(" from ".into());
                parts.push(c!("source").into());
                parts.push(self.print_import_assertions(path).into());
                parts.push(";".into());
                cat(parts)
            }
            "ExportNamespaceSpecifier" => lcat!["* as ", c!("exported")],
            "ExportDefaultSpecifier" => c!("exported"),
            "Import" => self.fso_pub("import"),
            "ImportExpression" => lcat!["import(", c!("source"), ")"],
            "ImportDeclaration" => {
                parts.push("import ".into());
                if let Some(k) = ast.str_of(n, "importKind") {
                    if k != "value" {
                        parts.push(format!("{} ", k).into());
                    }
                }
                let specs = ast.list(n, "specifiers");
                if !specs.is_empty() {
                    let mut unbraced = Vec::new();
                    let mut braced = Vec::new();
                    let arr = ast.get(n, "specifiers").clone();
                    path.push(PName::Key("specifiers"), arr);
                    for (i, s) in specs.iter().enumerate() {
                        path.push(PName::Idx(i), V::Node(*s));
                        match ast.ty(*s) {
                            "ImportSpecifier" => braced.push(self.p(path)),
                            "ImportDefaultSpecifier" | "ImportNamespaceSpecifier" => unbraced.push(self.p(path)),
                            _ => {}
                        }
                        path.pop();
                    }
                    path.pop();
                    for (i, l) in unbraced.iter().enumerate() {
                        if i > 0 {
                            parts.push(", ".into());
                        }
                        parts.push(l.into());
                    }
                    if !braced.is_empty() {
                        let mut lines = fs(", ").join(&braced);
                        if lines.get_line_length(1) > self.config.wrap_column {
                            lines = lcat![fs(",\n").join(&braced).indent(tw), ","];
                        }
                        if !unbraced.is_empty() {
                            parts.push(", ".into());
                        }
                        if lines.len() > 1 {
                            parts.push("{\n".into());
                            parts.push(lines.into());
                            parts.push("\n}".into());
                        } else if self.config.object_curly_spacing {
                            parts.push("{ ".into());
                            parts.push(lines.into());
                            parts.push(" }".into());
                        } else {
                            parts.push("{".into());
                            parts.push(lines.into());
                            parts.push("}".into());
                        }
                    }
                    parts.push(" from ".into());
                }
                parts.push(c!("source").into());
                parts.push(self.print_import_assertions(path).into());
                parts.push(";".into());
                cat(parts)
            }
            "ImportAttribute" => lcat![c!("key"), ": ", c!("value")],
            "StaticBlock" | "BlockStatement" => {
                if ty == "StaticBlock" {
                    parts.push("static ".into());
                }
                let naked = self.print_statement_sequence(path, "body");
                let dirs = ast.list(n, "directives");
                if naked.is_empty() && dirs.is_empty() {
                    parts.push("{}".into());
                    return cat(parts);
                }
                parts.push("{\n".into());
                for (i, d) in dirs.iter().enumerate() {
                    path.push(PName::Key("directives"), ast.get(n, "directives").clone());
                    path.push(PName::Idx(i), V::Node(*d));
                    let l = self.p(path);
                    path.pop();
                    path.pop();
                    parts.push(maybe_add_semicolon(l.indent(tw)).into());
                    parts.push(if dirs.len() > 1 || !naked.is_empty() { "\n" } else { "" }.into());
                }
                parts.push(naked.indent(tw).into());
                parts.push("\n}".into());
                cat(parts)
            }
            "ReturnStatement" => {
                parts.push("return".into());
                if let Some(arg) = ast.child(n, "argument") {
                    let is_jsx = matches!(ast.ty(arg), "JSXElement" | "JSXFragment");
                    let mut al = c!("argument");
                    if al.starts_with_comment() || (al.len() > 1 && is_jsx) {
                        if is_jsx && ast.extra(arg, "parenthesized").as_bool() {
                            let saved = self.unparen;
                            self.unparen = Some(arg);
                            al = c!("argument");
                            self.unparen = saved;
                        }
                        parts.push(" ".into());
                        parts.push(lcat!["(\n", al].indent_tail(tw).into());
                        parts.push("\n)".into());
                    } else {
                        parts.push(" ".into());
                        parts.push(al.into());
                    }
                }
                parts.push(";".into());
                cat(parts)
            }
            "CallExpression" | "OptionalCallExpression" => {
                parts.push(c!("callee").into());
                if ast.flag(n, "optional") {
                    parts.push("?.".into());
                }
                if ast.child(n, "typeParameters").is_some() {
                    parts.push(c!("typeParameters").into());
                }
                if ast.child(n, "typeArguments").is_some() {
                    parts.push(c!("typeArguments").into());
                }
                parts.push(self.print_arguments_list(path).into());
                cat(parts)
            }
            "RecordExpression" | "ObjectExpression" | "ObjectPattern" => {
                if ty == "RecordExpression" {
                    parts.push("#".into());
                }
                let props = ast.list_opt(n, "properties");
                let len = props.len();
                let one_line = len == 0;
                parts.push(if one_line { "{" } else { "{\n" }.into());
                let left_idx = parts.len() - 1;
                let mut allow_break = false;
                let arr = ast.get(n, "properties").clone();
                path.push(PName::Key("properties"), arr.clone());
                let items = arr.as_arr().cloned().unwrap_or_default();
                for (i, it) in items.iter().enumerate() {
                    path.push(PName::Idx(i), it.clone());
                    let mut lines = self.p(path);
                    path.pop();
                    if !one_line {
                        lines = lines.indent(tw);
                    }
                    let multi = lines.len() > 1;
                    if multi && allow_break {
                        parts.push("\n".into());
                    }
                    parts.push(lines.into());
                    if i < len - 1 {
                        parts.push(if multi { ",\n\n" } else { ",\n" }.into());
                        allow_break = !multi;
                    } else if !one_line && self.config.trailing_comma && it.as_node().map(|x| !ast.is(x, "RestElement")).unwrap_or(true) {
                        parts.push(",".into());
                    }
                }
                path.pop();
                parts.push(if one_line { "}" } else { "\n}" }.into());
                if len != 0 && one_line && self.config.object_curly_spacing {
                    parts[left_idx] = "{ ".into();
                    let l = parts.len() - 1;
                    parts[l] = " }".into();
                }
                if ast.flag(n, "optional") {
                    parts.push("?".into());
                }
                if ast.child(n, "typeAnnotation").is_some() {
                    parts.push(c!("typeAnnotation").into());
                }
                cat(parts)
            }
            "PropertyPattern" => lcat![c!("key"), ": ", c!("pattern")],
            "ObjectProperty" | "Property" => {
                let kind = ast.str_of(n, "kind").unwrap_or("");
                if ast.flag(n, "method") || kind == "get" || kind == "set" {
                    return self.print_method(path);
                }
                let value = ast.child(n, "value");
                if ast.flag(n, "shorthand") && value.map(|v| ast.is(v, "AssignmentPattern")).unwrap_or(false) {
                    return c!("value");
                }
                let key = c!("key");
                if ast.flag(n, "computed") {
                    parts.push("[".into());
                    parts.push(key.into());
                    parts.push("]".into());
                } else {
                    parts.push(key.into());
                }
                let kname = ast.child(n, "key").and_then(|k| ast.name(k).map(|s| s.to_string()));
                let vname = value.and_then(|v| ast.name(v).map(|s| s.to_string()));
                if !ast.flag(n, "shorthand") || kname != vname {
                    parts.push(": ".into());
                    parts.push(c!("value").into());
                }
                cat(parts)
            }
            "PrivateName" => lcat!["#", c!("id")],
            "Decorator" => lcat!["@", c!("expression")],
            "TupleExpression" | "ArrayExpression" | "ArrayPattern" => {
                if ty == "TupleExpression" {
                    parts.push("#".into());
                }
                let elems = ast.list_opt(n, "elements");
                let len = elems.len();
                let printed = self.map(path, "elements");
                let joined = fs(", ").join(&printed);
                let one_line = joined.get_line_length(1) <= self.config.wrap_column;
                if one_line {
                    parts.push(if self.config.array_bracket_spacing { "[ " } else { "[" }.into());
                } else {
                    parts.push("[\n".into());
                }
                for (i, e) in elems.iter().enumerate() {
                    if e.is_none() {
                        parts.push(",".into());
                    } else {
                        let mut lines = printed[i].clone();
                        if one_line {
                            if i > 0 {
                                parts.push(" ".into());
                            }
                        } else {
                            lines = lines.indent(tw);
                        }
                        parts.push(lines.into());
                        if i < len - 1 || (!one_line && self.config.trailing_comma) {
                            parts.push(",".into());
                        }
                        if !one_line {
                            parts.push("\n".into());
                        }
                    }
                }
                parts.push(if one_line && self.config.array_bracket_spacing { " ]" } else { "]" }.into());
                if ast.flag(n, "optional") {
                    parts.push("?".into());
                }
                if ast.child(n, "typeAnnotation").is_some() {
                    parts.push(c!("typeAnnotation").into());
                }
                cat(parts)
            }
            "SequenceExpression" => {
                let m = self.map(path, "expressions");
                fs(", ").join(&m)
            }
            "ThisExpression" => fs("this"),
            "Super" => fs("super"),
            "NullLiteral" => fs("null"),
            "RegExpLiteral" => {
                let s = possible_raw(ast, n).unwrap_or_else(|| format!("/{}/{}", ast.str_of(n, "pattern").unwrap_or(""), ast.str_of(n, "flags").unwrap_or("")));
                self.fso_pub(&s)
            }
            "BigIntLiteral" => {
                let s = possible_raw(ast, n).unwrap_or_else(|| format!("{}n", v_to_string(ast.get(n, "value"))));
                self.fso_pub(&s)
            }
            "NumericLiteral" => {
                let s = possible_raw(ast, n).unwrap_or_else(|| v_to_string(ast.get(n, "value")));
                self.fso_pub(&s)
            }
            "StringLiteral" => fs(&self.node_str(ast.str_of(n, "value").unwrap_or(""))),
            "BooleanLiteral" | "Literal" => {
                let s = possible_raw(ast, n).unwrap_or_else(|| match ast.get(n, "value") {
                    V::Str(s) => self.node_str(s),
                    other => v_to_string(other),
                });
                self.fso_pub(&s)
            }
            "Directive" => c!("value"),
            "DirectiveLiteral" => {
                let s = possible_raw(ast, n).unwrap_or_else(|| self.node_str(ast.str_of(n, "value").unwrap_or("")));
                self.fso_pub(&s)
            }
            "InterpreterDirective" => self.fso_pub(&format!("#!{}\n", ast.str_of(n, "value").unwrap_or(""))),
            "UnaryExpression" => {
                let op = ast.str_of(n, "operator").unwrap_or("").to_string();
                parts.push(op.clone().into());
                if op.chars().last().map(|c| c.is_ascii_lowercase()).unwrap_or(false) {
                    parts.push(" ".into());
                }
                parts.push(c!("argument").into());
                cat(parts)
            }
            "UpdateExpression" => {
                let a = c!("argument");
                let op = ast.str_of(n, "operator").unwrap_or("").to_string();
                if ast.flag(n, "prefix") {
                    lcat![op, a]
                } else {
                    lcat![a, op]
                }
            }
            "ConditionalExpression" => lcat![c!("test"), " ? ", c!("consequent"), " : ", c!("alternate")],
            "NewExpression" => {
                parts.push("new ".into());
                parts.push(c!("callee").into());
                if ast.child(n, "typeParameters").is_some() {
                    parts.push(c!("typeParameters").into());
                }
                if ast.child(n, "typeArguments").is_some() {
                    parts.push(c!("typeArguments").into());
                }
                if matches!(ast.get(n, "arguments"), V::Arr(_)) {
                    parts.push(self.print_arguments_list(path).into());
                }
                cat(parts)
            }
            "VariableDeclaration" => {
                if ast.flag(n, "declare") {
                    parts.push("declare ".into());
                }
                let kind = ast.str_of(n, "kind").unwrap_or("var").to_string();
                parts.push(kind.clone().into());
                parts.push(" ".into());
                let printed = self.map(path, "declarations");
                let max_len = printed.iter().map(|l| l.len()).max().unwrap_or(0);
                if max_len == 1 {
                    parts.push(fs(", ").join(&printed).into());
                } else if printed.len() > 1 {
                    parts.push(fs(",\n").join(&printed).indent_tail(kind.len() as i64 + 1).into());
                } else if let Some(p0) = printed.first() {
                    parts.push(p0.into());
                }
                let parent = path.parent_node(ast).map(|p| ast.ty(p));
                if !matches!(parent, Some("ForStatement" | "ForInStatement" | "ForOfStatement" | "ForAwaitStatement")) {
                    parts.push(";".into());
                }
                cat(parts)
            }
            "VariableDeclarator" => {
                if ast.child(n, "init").is_some() {
                    let id = c!("id");
                    let init = c!("init");
                    fs(" = ").join(&[id, init])
                } else {
                    c!("id")
                }
            }
            "WithStatement" => lcat!["with (", c!("object"), ") ", c!("body")],
            "IfStatement" => {
                let con = c!("consequent");
                let con = self.adjust_clause(con);
                parts.push("if (".into());
                parts.push(c!("test").into());
                parts.push(")".into());
                let ends_brace = con.last_non_space_char() == Some(b'}' as u16);
                parts.push(con.into());
                if ast.child(n, "alternate").is_some() {
                    parts.push(if ends_brace { " else" } else { "\nelse" }.into());
                    let alt = c!("alternate");
                    parts.push(self.adjust_clause(alt).into());
                }
                cat(parts)
            }
            "ForStatement" => {
                let init = c!("init");
                let sep = if init.len() > 1 { ";\n" } else { "; " };
                let test = c!("test");
                let update = c!("update");
                let indented = fs(sep).join(&[init, test, update]).indent_tail(5);
                let head = lcat!["for (", indented, ")"];
                let body = c!("body");
                let mut clause = self.adjust_clause(body);
                let hl = head.len();
                parts.push(head.into());
                if hl > 1 {
                    parts.push("\n".into());
                    clause = clause.trim_left();
                }
                parts.push(clause.into());
                cat(parts)
            }
            "WhileStatement" => {
                let t = c!("test");
                let b = c!("body");
                lcat!["while (", t, ")", self.adjust_clause(b)]
            }
            "ForInStatement" => {
                let l = c!("left");
                let r = c!("right");
                let b = c!("body");
                lcat![if ast.flag(n, "each") { "for each (" } else { "for (" }, l, " in ", r, ")", self.adjust_clause(b)]
            }
            "ForOfStatement" | "ForAwaitStatement" => {
                parts.push("for ".into());
                if ast.flag(n, "await") || ty == "ForAwaitStatement" {
                    parts.push("await ".into());
                }
                let l = c!("left");
                let r = c!("right");
                let b = c!("body");
                parts.push("(".into());
                parts.push(l.into());
                parts.push(" of ".into());
                parts.push(r.into());
                parts.push(")".into());
                parts.push(self.adjust_clause(b).into());
                cat(parts)
            }
            "DoWhileStatement" => {
                let b = c!("body");
                let do_body = lcat!["do", self.adjust_clause(b)];
                let eb = do_body.last_non_space_char() == Some(b'}' as u16);
                parts.push(do_body.into());
                parts.push(if eb { " while" } else { "\nwhile" }.into());
                parts.push(" (".into());
                parts.push(c!("test").into());
                parts.push(");".into());
                cat(parts)
            }
            "BreakStatement" | "ContinueStatement" => {
                parts.push(if ty == "BreakStatement" { "break" } else { "continue" }.into());
                if ast.child(n, "label").is_some() {
                    parts.push(" ".into());
                    parts.push(c!("label").into());
                }
                parts.push(";".into());
                cat(parts)
            }
            "LabeledStatement" => lcat![c!("label"), ":\n", c!("body")],
            "TryStatement" => {
                parts.push("try ".into());
                parts.push(c!("block").into());
                if ast.child(n, "handler").is_some() {
                    parts.push(" ".into());
                    parts.push(c!("handler").into());
                }
                if ast.child(n, "finalizer").is_some() {
                    parts.push(" finally ".into());
                    parts.push(c!("finalizer").into());
                }
                cat(parts)
            }
            "CatchClause" => {
                parts.push("catch ".into());
                if ast.child(n, "param").is_some() {
                    parts.push("(".into());
                    parts.push(c!("param").into());
                    parts.push(") ".into());
                }
                parts.push(c!("body").into());
                cat(parts)
            }
            "ThrowStatement" => lcat!["throw ", c!("argument"), ";"],
            "SwitchStatement" => {
                let d = c!("discriminant");
                let cases = self.map(path, "cases");
                lcat!["switch (", d, ") {\n", fs("\n").join(&cases), "\n}"]
            }
            "SwitchCase" => {
                if ast.child(n, "test").is_some() {
                    parts.push("case ".into());
                    parts.push(c!("test").into());
                    parts.push(":".into());
                } else {
                    parts.push("default:".into());
                }
                if !ast.list(n, "consequent").is_empty() {
                    parts.push("\n".into());
                    parts.push(self.print_statement_sequence(path, "consequent").indent(tw).into());
                }
                cat(parts)
            }
            "DebuggerStatement" => fs("debugger;"),
            "TemplateElement" => {
                let raw = ast.get(n, "value").obj_get("raw").as_str().unwrap_or("").to_string();
                self.fso_pub(&raw).lock_indent_tail()
            }
            "TemplateLiteral" => {
                let exprs = self.map(path, "expressions");
                parts.push("`".into());
                let quasis = ast.get(n, "quasis").clone();
                let items = quasis.as_arr().cloned().unwrap_or_default();
                path.push(PName::Key("quasis"), quasis);
                for (i, q) in items.iter().enumerate() {
                    path.push(PName::Idx(i), q.clone());
                    parts.push(self.p(path).into());
                    path.pop();
                    if i < exprs.len() {
                        parts.push("${".into());
                        parts.push(exprs[i].clone().into());
                        parts.push("}".into());
                    }
                }
                path.pop();
                parts.push("`".into());
                cat(parts).lock_indent_tail()
            }
            "TaggedTemplateExpression" => {
                parts.push(c!("tag").into());
                if ast.child(n, "typeParameters").is_some() {
                    parts.push(c!("typeParameters").into());
                }
                parts.push(c!("quasi").into());
                cat(parts)
            }
            "CommentBlock" | "Block" => lcat!["/*", self.fso_pub(ast.str_of(n, "value").unwrap_or("")), "*/"],
            "CommentLine" | "Line" => lcat!["//", self.fso_pub(ast.str_of(n, "value").unwrap_or(""))],
            _ => self.print_more(path, n, ty),
        }
    }

    fn print_export_declaration(&mut self, path: &mut Path) -> Lines {
        let ast = self.ast;
        let tw = self.tw();
        let decl = path.value().as_node().unwrap();
        let mut parts: Vec<Part> = vec!["export ".into()];
        if ast.str_of(decl, "exportKind") == Some("type") && ast.child(decl, "declaration").is_none() {
            parts.push("type ".into());
        }
        if ast.flag(decl, "default") || ast.is(decl, "ExportDefaultDeclaration") {
            parts.push("default ".into());
        }
        if ast.child(decl, "declaration").is_some() {
            parts.push(self.call(path, "declaration").into());
        } else if matches!(ast.get(decl, "specifiers"), V::Arr(_)) {
            let specs = ast.list(decl, "specifiers");
            if specs.len() == 1 && ast.is(specs[0], "ExportBatchSpecifier") {
                parts.push("*".into());
            } else if specs.is_empty() {
                parts.push("{}".into());
            } else if matches!(ast.ty(specs[0]), "ExportDefaultSpecifier" | "ExportNamespaceSpecifier") {
                let mut unbraced = Vec::new();
                let mut braced = Vec::new();
                path.push(PName::Key("specifiers"), ast.get(decl, "specifiers").clone());
                for (i, s) in specs.iter().enumerate() {
                    path.push(PName::Idx(i), V::Node(*s));
                    if matches!(ast.ty(*s), "ExportDefaultSpecifier" | "ExportNamespaceSpecifier") {
                        unbraced.push(self.p(path));
                    } else {
                        braced.push(self.p(path));
                    }
                    path.pop();
                }
                path.pop();
                for (i, l) in unbraced.iter().enumerate() {
                    if i > 0 {
                        parts.push(", ".into());
                    }
                    parts.push(l.into());
                }
                if !braced.is_empty() {
                    let mut lines = fs(", ").join(&braced);
                    if lines.get_line_length(1) > self.config.wrap_column {
                        lines = lcat![fs(",\n").join(&braced).indent(tw), ","];
                    }
                    if !unbraced.is_empty() {
                        parts.push(", ".into());
                    }
                    if lines.len() > 1 {
                        parts.push("{\n".into());
                        parts.push(lines.into());
                        parts.push("\n}".into());
                    } else if self.config.object_curly_spacing {
                        parts.push("{ ".into());
                        parts.push(lines.into());
                        parts.push(" }".into());
                    } else {
                        parts.push("{".into());
                        parts.push(lines.into());
                        parts.push("}".into());
                    }
                }
            } else {
                let sp = self.config.object_curly_spacing;
                let m = self.map(path, "specifiers");
                parts.push(if sp { "{ " } else { "{" }.into());
                parts.push(fs(", ").join(&m).into());
                parts.push(if sp { " }" } else { "}" }.into());
            }
            if ast.child(decl, "source").is_some() {
                parts.push(" from ".into());
                parts.push(self.call(path, "source").into());
                parts.push(self.print_import_assertions(path).into());
            }
        }
        let lines = cat(parts);
        let dty = ast.child(decl, "declaration").map(|d| ast.ty(d));
        if lines.last_non_space_char() != Some(b';' as u16)
            && !matches!(dty, Some("FunctionDeclaration" | "ClassDeclaration" | "TSModuleDeclaration" | "TSInterfaceDeclaration" | "TSEnumDeclaration"))
        {
            return lcat![lines, ";"];
        }
        lines
    }
}

pub fn v_to_string(v: &V) -> String {
    match v {
        V::Str(s) => s.to_string(),
        V::Num(n) => num_to_js(*n),
        V::Bool(b) => b.to_string(),
        V::Null => "null".into(),
        V::Undef => "undefined".into(),
        _ => String::new(),
    }
}

#[allow(dead_code)]
fn _c(l: &[Lines]) -> Lines {
    concat(l)
}
