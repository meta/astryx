//! JSX, class and TypeScript cases of `genericPrintNoParens`.

use super::ast::*;
use super::lines::{cat, concat, Lines, Part};
use super::path::{PName, Path};
use super::printer::*;
use super::types::*;
use crate::lcat;

fn has_ws_nonspace(s: &str) -> bool {
    s.encode_utf16().any(|c| !super::lines::is_ws_unit(c))
}

impl<'a> Printer<'a> {
    pub fn print_more(&mut self, path: &mut Path, n: NodeId, ty: &str) -> Lines {
        let ast = self.ast;
        let tw = self.tw();
        let mut parts: Vec<Part> = Vec::new();
        macro_rules! c {
            ($k:expr) => {
                self.call(path, $k)
            };
        }
        match ty {
            "JSXAttribute" => {
                parts.push(c!("name").into());
                if ast.child(n, "value").is_some() {
                    parts.push("=".into());
                    parts.push(c!("value").into());
                }
                cat(parts)
            }
            "JSXIdentifier" => self.fso_pub(ast.name(n).unwrap_or("")),
            "JSXNamespacedName" => {
                let a = c!("namespace");
                let b = c!("name");
                fs(":").join(&[a, b])
            }
            "JSXMemberExpression" => {
                let a = c!("object");
                let b = c!("property");
                fs(".").join(&[a, b])
            }
            "JSXSpreadAttribute" => lcat!["{...", c!("argument"), "}"],
            "JSXSpreadChild" => lcat!["{...", c!("expression"), "}"],
            "JSXExpressionContainer" => lcat!["{", c!("expression"), "}"],
            "JSXElement" | "JSXFragment" => {
                let (op, cl) = if ty == "JSXElement" { ("openingElement", "closingElement") } else { ("openingFragment", "closingFragment") };
                let opening = c!(op);
                if let Some(o) = ast.child(n, op) {
                    if ast.flag(o, "selfClosing") {
                        return opening;
                    }
                }
                let children = ast.get(n, "children").clone();
                let items = children.as_arr().cloned().unwrap_or_default();
                path.push(PName::Key("children"), children);
                let mut kids = Vec::new();
                for (i, ch) in items.iter().enumerate() {
                    let cid = ch.as_node();
                    if let Some(cid) = cid {
                        if is_literal(ast.ty(cid)) {
                            if let Some(v) = ast.str_of(cid, "value") {
                                if has_ws_nonspace(v) {
                                    let trimmed: String = {
                                        let u: Vec<u16> = v.encode_utf16().collect();
                                        let k = u.iter().take_while(|&&c| super::lines::is_ws_unit(c)).count();
                                        String::from_utf16_lossy(&u[k..])
                                    };
                                    kids.push(fs(&trimmed));
                                    continue;
                                } else if has_blank_line(v) {
                                    kids.push(fs("\n\n"));
                                    continue;
                                } else if v.contains('\n') {
                                    kids.push(fs("\n"));
                                    continue;
                                }
                            }
                        }
                    }
                    path.push(PName::Idx(i), ch.clone());
                    kids.push(self.p(path));
                    path.pop();
                }
                path.pop();
                let child_lines = concat(&kids).indent_tail(tw);
                let closing = c!(cl);
                lcat![opening, child_lines, closing]
            }
            "JSXOpeningElement" => {
                parts.push("<".into());
                parts.push(c!("name").into());
                let tdp = c!("typeParameters");
                if tdp.len() > 0 && !tdp.is_empty() {
                    parts.push(tdp.into());
                }
                let attrs = ast.get(n, "attributes").clone();
                let items = attrs.as_arr().cloned().unwrap_or_default();
                path.push(PName::Key("attributes"), attrs);
                let mut attr_parts: Vec<(bool, Lines)> = Vec::new();
                for (i, a) in items.iter().enumerate() {
                    attr_parts.push((true, fs(" ")));
                    path.push(PName::Idx(i), a.clone());
                    attr_parts.push((false, self.p(path)));
                    path.pop();
                }
                path.pop();
                let al: Vec<Lines> = attr_parts.iter().map(|(_, l)| l.clone()).collect();
                let mut attr_lines = concat(&al);
                if attr_lines.len() > 1 || attr_lines.get_line_length(1) > self.config.wrap_column {
                    let al2: Vec<Lines> = attr_parts.iter().map(|(sp, l)| if *sp { fs("\n") } else { l.clone() }).collect();
                    attr_lines = concat(&al2).indent_tail(tw);
                }
                parts.push(attr_lines.into());
                parts.push(if ast.flag(n, "selfClosing") { " />" } else { ">" }.into());
                cat(parts)
            }
            "JSXClosingElement" => lcat!["</", c!("name"), ">"],
            "JSXOpeningFragment" => fs("<>"),
            "JSXClosingFragment" => fs("</>"),
            "JSXText" => self.fso_pub(ast.str_of(n, "value").unwrap_or("")),
            "JSXEmptyExpression" => fs(""),
            "ClassBody" => {
                if ast.list(n, "body").is_empty() {
                    return fs("{}");
                }
                lcat!["{\n", self.print_statement_sequence(path, "body").indent(tw), "\n}"]
            }
            "ClassProperty" => {
                if ast.flag(n, "declare") {
                    parts.push("declare ".into());
                }
                if let Some(a) = ast.str_of(n, "accessibility").or_else(|| ast.str_of(n, "access")) {
                    parts.push(a.to_string().into());
                    parts.push(" ".into());
                }
                if ast.flag(n, "static") {
                    parts.push("static ".into());
                }
                if ast.flag(n, "abstract") {
                    parts.push("abstract ".into());
                }
                if ast.flag(n, "readonly") {
                    parts.push("readonly ".into());
                }
                let mut key = c!("key");
                if ast.flag(n, "computed") {
                    key = lcat!["[", key, "]"];
                }
                parts.push(key.into());
                if ast.flag(n, "optional") {
                    parts.push("?".into());
                }
                if ast.flag(n, "definite") {
                    parts.push("!".into());
                }
                if ast.child(n, "typeAnnotation").is_some() {
                    parts.push(c!("typeAnnotation").into());
                }
                if ast.child(n, "value").is_some() {
                    parts.push(" = ".into());
                    parts.push(c!("value").into());
                }
                parts.push(";".into());
                cat(parts)
            }
            "ClassPrivateProperty" => {
                if ast.flag(n, "static") {
                    parts.push("static ".into());
                }
                parts.push(c!("key").into());
                if ast.child(n, "typeAnnotation").is_some() {
                    parts.push(c!("typeAnnotation").into());
                }
                if ast.child(n, "value").is_some() {
                    parts.push(" = ".into());
                    parts.push(c!("value").into());
                }
                parts.push(";".into());
                cat(parts)
            }
            "ClassAccessorProperty" => {
                for m in class_member_modifiers(ast, n) {
                    parts.push(m.into());
                }
                parts.push("accessor ".into());
                if ast.flag(n, "computed") {
                    parts.push("[".into());
                    parts.push(c!("key").into());
                    parts.push("]".into());
                } else {
                    parts.push(c!("key").into());
                }
                if ast.flag(n, "optional") {
                    parts.push("?".into());
                }
                if ast.flag(n, "definite") {
                    parts.push("!".into());
                }
                if ast.child(n, "typeAnnotation").is_some() {
                    parts.push(c!("typeAnnotation").into());
                }
                if ast.child(n, "value").is_some() {
                    parts.push(" = ".into());
                    parts.push(c!("value").into());
                }
                parts.push(";".into());
                cat(parts)
            }
            "ClassDeclaration" | "ClassExpression" => {
                if ast.flag(n, "declare") {
                    parts.push("declare ".into());
                }
                if ast.flag(n, "abstract") {
                    parts.push("abstract ".into());
                }
                parts.push("class".into());
                if ast.child(n, "id").is_some() {
                    parts.push(" ".into());
                    parts.push(c!("id").into());
                }
                if ast.child(n, "typeParameters").is_some() {
                    parts.push(c!("typeParameters").into());
                }
                if ast.child(n, "superClass").is_some() {
                    parts.push(" extends ".into());
                    parts.push(c!("superClass").into());
                    parts.push(c!("superTypeParameters").into());
                }
                if !ast.list(n, "implements").is_empty() {
                    parts.push(" implements ".into());
                    let m = self.map(path, "implements");
                    parts.push(fs(", ").join(&m).into());
                }
                parts.push(" ".into());
                parts.push(c!("body").into());
                cat(parts)
            }
            "TSInterfaceDeclaration" => {
                if ast.flag(n, "declare") {
                    parts.push("declare ".into());
                }
                parts.push("interface ".into());
                parts.push(c!("id").into());
                parts.push(c!("typeParameters").into());
                parts.push(" ".into());
                if !ast.list(n, "extends").is_empty() {
                    parts.push("extends ".into());
                    let m = self.map(path, "extends");
                    parts.push(fs(", ").join(&m).into());
                    parts.push(" ".into());
                }
                if ast.child(n, "body").is_some() {
                    parts.push(c!("body").into());
                }
                cat(parts)
            }
            "TSNumberKeyword" => self.fso_pub("number"),
            "TSBigIntKeyword" => self.fso_pub("bigint"),
            "TSObjectKeyword" => self.fso_pub("object"),
            "TSBooleanKeyword" => self.fso_pub("boolean"),
            "TSStringKeyword" => self.fso_pub("string"),
            "TSSymbolKeyword" => self.fso_pub("symbol"),
            "TSAnyKeyword" => self.fso_pub("any"),
            "TSVoidKeyword" => self.fso_pub("void"),
            "TSIntrinsicKeyword" => self.fso_pub("intrinsic"),
            "TSThisType" => self.fso_pub("this"),
            "TSNullKeyword" => self.fso_pub("null"),
            "TSUndefinedKeyword" => self.fso_pub("undefined"),
            "TSUnknownKeyword" => self.fso_pub("unknown"),
            "TSNeverKeyword" => self.fso_pub("never"),
            "TSArrayType" => {
                let et = ast.child(n, "elementType");
                if et.map(|e| ast.is(e, "TSUnionType")).unwrap_or(false) {
                    lcat!["(", c!("elementType"), ")", "[]"]
                } else {
                    lcat![c!("elementType"), "[]"]
                }
            }
            "TSLiteralType" => c!("literal"),
            "TSUnionType" => {
                let m = self.map(path, "types");
                fs(" | ").join(&m)
            }
            "TSIntersectionType" => {
                let m = self.map(path, "types");
                fs(" & ").join(&m)
            }
            "TSConditionalType" => lcat![c!("checkType"), " extends ", c!("extendsType"), " ? ", c!("trueType"), " : ", c!("falseType")],
            "TSInferType" => lcat!["infer ", c!("typeParameter")],
            "TSParenthesizedType" => lcat!["(", c!("typeAnnotation"), ")"],
            "TSFunctionType" | "TSConstructorType" => {
                let pre = if ty == "TSConstructorType" {
                    if ast.flag(n, "abstract") {
                        "abstract new "
                    } else {
                        "new "
                    }
                } else {
                    ""
                };
                let tp = c!("typeParameters");
                let fp = self.print_function_params(path);
                let ta = self.call2(path, "typeAnnotation", "typeAnnotation");
                lcat![pre, tp, "(", fp, ") => ", ta]
            }
            "TSMappedType" => {
                let ro = match ast.get(n, "readonly") {
                    V::Bool(true) => "readonly ".to_string(),
                    V::Str(s) => format!("{}readonly ", s),
                    _ => String::new(),
                };
                let opt = match ast.get(n, "optional") {
                    V::Bool(true) => "?".to_string(),
                    V::Str(s) => format!("{}?", s),
                    _ => String::new(),
                };
                parts.push(ro.into());
                parts.push("[".into());
                parts.push(c!("typeParameter").into());
                parts.push("]".into());
                parts.push(opt.into());
                if ast.child(n, "typeAnnotation").is_some() {
                    parts.push(": ".into());
                    parts.push(c!("typeAnnotation").into());
                    parts.push(";".into());
                }
                lcat!["{\n", cat(parts).indent(tw), "\n}"]
            }
            "TSTupleType" => {
                let m = self.map(path, "elementTypes");
                lcat!["[", fs(", ").join(&m), "]"]
            }
            "TSNamedTupleMember" => {
                parts.push(c!("label").into());
                if ast.flag(n, "optional") {
                    parts.push("?".into());
                }
                parts.push(": ".into());
                parts.push(c!("elementType").into());
                cat(parts)
            }
            "TSRestType" => lcat!["...", c!("typeAnnotation")],
            "TSOptionalType" => lcat![c!("typeAnnotation"), "?"],
            "TSIndexedAccessType" => lcat![c!("objectType"), "[", c!("indexType"), "]"],
            "TSTypeOperator" => lcat![c!("operator"), " ", c!("typeAnnotation")],
            "TSTypeLiteral" | "TSInterfaceBody" => {
                let key = if ty == "TSTypeLiteral" { "members" } else { "body" };
                let m: Vec<Lines> = self
                    .map(path, key)
                    .into_iter()
                    .map(|l| if l.last_non_space_char() != Some(b';' as u16) { lcat![l, ";"] } else { l })
                    .collect();
                let members = fs("\n").join(&m);
                if members.is_empty() {
                    return self.fso_pub("{}");
                }
                lcat!["{\n", members.indent(tw), "\n}"]
            }
            "TSEnumMember" => {
                parts.push(c!("id").into());
                if ast.child(n, "initializer").is_some() {
                    parts.push(" = ".into());
                    parts.push(c!("initializer").into());
                }
                cat(parts)
            }
            "TSTypeQuery" => lcat!["typeof ", c!("exprName"), c!("typeParameters")],
            "TSParameterProperty" => {
                if let Some(a) = ast.str_of(n, "accessibility") {
                    parts.push(a.to_string().into());
                    parts.push(" ".into());
                }
                for k in ["override", "export", "static", "readonly"] {
                    if ast.flag(n, k) {
                        parts.push(format!("{} ", k).into());
                    }
                }
                parts.push(c!("parameter").into());
                cat(parts)
            }
            "TSTypeReference" => lcat![c!("typeName"), c!("typeParameters")],
            "TSQualifiedName" => lcat![c!("left"), ".", c!("right")],
            "TSAsExpression" | "TSSatisfiesExpression" => {
                let e = c!("expression");
                lcat![e, if ty == "TSSatisfiesExpression" { " satisfies " } else { " as " }, c!("typeAnnotation")]
            }
            "TSTypeCastExpression" => lcat![c!("expression"), c!("typeAnnotation")],
            "TSNonNullExpression" => lcat![c!("expression"), "!"],
            "TSTypeAnnotation" => {
                let parent = path.parent_node(ast).map(|p| ast.ty(p));
                let sep = match parent {
                    Some("TSFunctionType" | "TSConstructorType") => "=> ",
                    Some("TSTypePredicate") => "",
                    _ => ": ",
                };
                lcat![sep, c!("typeAnnotation")]
            }
            "TSIndexSignature" => {
                let params = self.map(path, "parameters");
                lcat![if ast.flag(n, "readonly") { "readonly " } else { "" }, "[", concat(&params), "]", c!("typeAnnotation")]
            }
            "TSPropertySignature" => {
                if ast.flag(n, "readonly") {
                    parts.push("readonly ".into());
                }
                if ast.flag(n, "computed") {
                    parts.push("[".into());
                    parts.push(c!("key").into());
                    parts.push("]".into());
                } else {
                    parts.push(c!("key").into());
                }
                parts.push(if ast.flag(n, "optional") { "?" } else { "" }.into());
                parts.push(c!("typeAnnotation").into());
                cat(parts)
            }
            "TSMethodSignature" => {
                match ast.str_of(n, "kind") {
                    Some("get") => parts.push("get ".into()),
                    Some("set") => parts.push("set ".into()),
                    _ => {}
                }
                if ast.flag(n, "computed") {
                    parts.push("[".into());
                    parts.push(c!("key").into());
                    parts.push("]".into());
                } else {
                    parts.push(c!("key").into());
                }
                if ast.flag(n, "optional") {
                    parts.push("?".into());
                }
                parts.push(c!("typeParameters").into());
                parts.push("(".into());
                parts.push(self.print_function_params(path).into());
                parts.push(")".into());
                parts.push(c!("typeAnnotation").into());
                cat(parts)
            }
            "TSTypePredicate" => {
                if ast.flag(n, "asserts") {
                    parts.push("asserts ".into());
                }
                parts.push(c!("parameterName").into());
                if ast.child(n, "typeAnnotation").is_some() {
                    parts.push(" is ".into());
                    parts.push(self.call2(path, "typeAnnotation", "typeAnnotation").into());
                }
                cat(parts)
            }
            "TSCallSignatureDeclaration" => {
                let tp = c!("typeParameters");
                let fp = self.print_function_params(path);
                lcat![tp, "(", fp, ")", c!("typeAnnotation")]
            }
            "TSConstructSignatureDeclaration" => {
                if ast.child(n, "typeParameters").is_some() {
                    parts.push("new".into());
                    parts.push(c!("typeParameters").into());
                } else {
                    parts.push("new ".into());
                }
                parts.push("(".into());
                parts.push(self.print_function_params(path).into());
                parts.push(")".into());
                parts.push(c!("typeAnnotation").into());
                cat(parts)
            }
            "TSTypeAliasDeclaration" => {
                lcat![if ast.flag(n, "declare") { "declare " } else { "" }, "type ", c!("id"), c!("typeParameters"), " = ", c!("typeAnnotation"), ";"]
            }
            "TSTypeParameter" => {
                for k in ["const", "in", "out"] {
                    if ast.flag(n, k) {
                        parts.push(format!("{} ", k).into());
                    }
                }
                parts.push(c!("name").into());
                let in_mapped = path.parent_node(ast).map(|p| ast.is(p, "TSMappedType")).unwrap_or(false);
                if ast.child(n, "constraint").is_some() {
                    parts.push(if in_mapped { " in " } else { " extends " }.into());
                    parts.push(c!("constraint").into());
                }
                if ast.child(n, "default").is_some() {
                    parts.push(" = ".into());
                    parts.push(c!("default").into());
                }
                cat(parts)
            }
            "TSTypeAssertion" => lcat!["<", c!("typeAnnotation"), "> ", c!("expression")],
            "TSTypeParameterDeclaration" | "TSTypeParameterInstantiation" => {
                let m = self.map(path, "params");
                lcat!["<", fs(", ").join(&m), ">"]
            }
            "TSEnumDeclaration" => {
                parts.push(if ast.flag(n, "declare") { "declare " } else { "" }.into());
                parts.push(if ast.flag(n, "const") { "const " } else { "" }.into());
                parts.push("enum ".into());
                parts.push(c!("id").into());
                let m = self.map(path, "members");
                let ml = fs(",\n").join(&m);
                if ml.is_empty() {
                    parts.push(" {}".into());
                } else {
                    parts.push(" {\n".into());
                    parts.push(ml.indent(tw).into());
                    parts.push("\n}".into());
                }
                cat(parts)
            }
            "TSExpressionWithTypeArguments" => lcat![c!("expression"), c!("typeParameters")],
            "TSImportType" => {
                parts.push("import(".into());
                parts.push(c!("argument").into());
                if ast.child(n, "options").is_some() {
                    parts.push(", ".into());
                    parts.push(c!("options").into());
                }
                parts.push(")".into());
                if ast.child(n, "qualifier").is_some() {
                    parts.push(".".into());
                    parts.push(c!("qualifier").into());
                }
                if ast.child(n, "typeParameters").is_some() {
                    parts.push(c!("typeParameters").into());
                }
                cat(parts)
            }
            "TSImportEqualsDeclaration" => {
                if ast.flag(n, "isExport") {
                    parts.push("export ".into());
                }
                parts.push(if ast.str_of(n, "importKind") == Some("type") { "import type " } else { "import " }.into());
                parts.push(c!("id").into());
                parts.push(" = ".into());
                parts.push(c!("moduleReference").into());
                maybe_add_semicolon(cat(parts))
            }
            "TSExternalModuleReference" => lcat!["require(", c!("expression"), ")"],
            "TSModuleDeclaration" => {
                let parent = path.parent_node(ast);
                if parent.map(|p| ast.is(p, "TSModuleDeclaration")).unwrap_or(false) {
                    parts.push(".".into());
                } else {
                    if ast.flag(n, "declare") {
                        parts.push("declare ".into());
                    }
                    if !ast.flag(n, "global") {
                        let id = ast.child(n, "id");
                        let external = id.map(|i| ast.is(i, "StringLiteral") || (ast.is(i, "Literal") && ast.str_of(i, "value").is_some())).unwrap_or(false);
                        if external || ast.str_of(n, "kind") == Some("module") {
                            parts.push("module ".into());
                        } else if ast.str_of(n, "kind") == Some("namespace") {
                            parts.push("namespace ".into());
                        } else {
                            parts.push("namespace ".into());
                        }
                    }
                }
                parts.push(c!("id").into());
                if ast.child(n, "body").is_some() {
                    parts.push(" ".into());
                    parts.push(c!("body").into());
                }
                cat(parts)
            }
            "TSModuleBlock" => {
                let naked = self.print_statement_sequence(path, "body");
                if naked.is_empty() {
                    fs("{}")
                } else {
                    lcat!["{\n", naked.indent(tw), "\n}"]
                }
            }
            "TSInstantiationExpression" => lcat![c!("expression"), c!("typeParameters")],
            "TSTemplateLiteralType" => {
                let types = self.map(path, "types");
                parts.push("`".into());
                let quasis = ast.get(n, "quasis").clone();
                let items = quasis.as_arr().cloned().unwrap_or_default();
                path.push(PName::Key("quasis"), quasis);
                for (i, q) in items.iter().enumerate() {
                    path.push(PName::Idx(i), q.clone());
                    parts.push(self.p(path).into());
                    path.pop();
                    if i < types.len() {
                        parts.push("${".into());
                        parts.push(types[i].clone().into());
                        parts.push("}".into());
                    }
                }
                path.pop();
                parts.push("`".into());
                cat(parts).lock_indent_tail()
            }
            "TSNamespaceExportDeclaration" => maybe_add_semicolon(lcat!["export as namespace ", c!("id")]),
            "V8IntrinsicIdentifier" => lcat!["%", c!("name")],
            "TopicReference" => fs("#"),
            _ => panic!("unknown type: {:?}", ty),
        }
    }
}

fn has_blank_line(s: &str) -> bool {
    // /\n\s*\n/
    let u: Vec<u16> = s.encode_utf16().collect();
    for i in 0..u.len() {
        if u[i] == 10 {
            let mut j = i + 1;
            while j < u.len() && super::lines::is_ws_unit(u[j]) {
                if u[j] == 10 {
                    return true;
                }
                j += 1;
            }
        }
    }
    false
}
