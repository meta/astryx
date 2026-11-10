//! TypeScript 7's syntax tree, read from the binary source file the API
//! returns (`getSourceFile`), with the accessors the checks use: the same
//! node tests, child properties, `getStart` and `forEachChild` as the JS
//! facade over `typescript-native/unstable/ast`.
//!
//! The encoding: a 44-byte header, a string table, extended data, and fixed
//! 28-byte node records (kind, pos, end, next, parent, data, flags) in
//! preorder. Children follow their parent; `next` links siblings; a node list
//! is a record of kind `0xFFFFFFFF` whose `data` is its length.

use super::syntax_tables as tables;

pub use tables::kind as kind_of;

pub const KIND_NODE_LIST: u32 = 0xFFFF_FFFF;

const HEADER_OFFSET_STRING_TABLE_OFFSETS: usize = 24;
const HEADER_OFFSET_STRING_TABLE: usize = 28;
const HEADER_OFFSET_EXTENDED_DATA: usize = 32;
const HEADER_OFFSET_STRUCTURED_DATA: usize = 36;
const NO_STRUCTURED_DATA: u32 = 0xFFFF_FFFF;
const HEADER_OFFSET_NODES: usize = 40;
const NODE_LEN: usize = 28;
const NODE_DATA_TYPE_MASK: u32 = 0xC000_0000;
const NODE_DATA_TYPE_CHILDREN: u32 = 0;
const NODE_STRING_INDEX_MASK: u32 = 0x00FF_FFFF;
const NODE_EXTENDED_DATA_MASK: u32 = 0x00FF_FFFF;

/// A value the checks pass around: a node, a node list, or nothing
/// (`undefined`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum V {
    #[default]
    Undef,
    Node(u32, u32),
    List(u32, u32),
}

impl V {
    pub fn is_undefined(&self) -> bool {
        matches!(self, V::Undef)
    }
    pub fn is_null(&self) -> bool {
        false
    }
    pub fn is_some(&self) -> bool {
        !self.is_undefined()
    }
    pub fn file(&self) -> Option<u32> {
        match *self {
            V::Node(f, _) | V::List(f, _) => Some(f),
            V::Undef => None,
        }
    }
}

struct File {
    data: Vec<u8>,
    off_nodes: usize,
    off_str_offsets: usize,
    off_str: usize,
    off_ext: usize,
    off_structured: usize,
    path: String,
    text16: Vec<u16>,
    text: String,
    line_starts: Vec<usize>,
}

fn u32_at(d: &[u8], at: usize) -> u32 {
    u32::from_le_bytes([d[at], d[at + 1], d[at + 2], d[at + 3]])
}

/// WTF-8 to UTF-16: a three-byte encoded surrogate stays a lone code unit.
pub fn wtf8_to_utf16(bytes: &[u8]) -> Vec<u16> {
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b < 0x80 {
            out.push(b as u16);
            i += 1;
        } else if b & 0xE0 == 0xC0 && i + 1 < bytes.len() {
            out.push((((b & 0x1F) as u16) << 6) | (bytes[i + 1] & 0x3F) as u16);
            i += 2;
        } else if b & 0xF0 == 0xE0 && i + 2 < bytes.len() {
            out.push((((b & 0x0F) as u16) << 12) | (((bytes[i + 1] & 0x3F) as u16) << 6) | (bytes[i + 2] & 0x3F) as u16);
            i += 3;
        } else if b & 0xF8 == 0xF0 && i + 3 < bytes.len() {
            let cp = (((b & 0x07) as u32) << 18) | (((bytes[i + 1] & 0x3F) as u32) << 12) | (((bytes[i + 2] & 0x3F) as u32) << 6) | (bytes[i + 3] & 0x3F) as u32;
            let c = cp - 0x10000;
            out.push(0xD800 | (c >> 10) as u16);
            out.push(0xDC00 | (c & 0x3FF) as u16);
            i += 4;
        } else {
            out.push(0xFFFD);
            i += 1;
        }
    }
    out
}

/// `computeLineStarts(text)`.
pub fn line_starts(text: &[u16]) -> Vec<usize> {
    let mut result = Vec::new();
    let mut pos = 0;
    let mut line_start = 0;
    while pos < text.len() {
        let ch = text[pos];
        pos += 1;
        match ch {
            0x0D => {
                if text.get(pos) == Some(&0x0A) {
                    pos += 1;
                }
                result.push(line_start);
                line_start = pos;
            }
            0x0A => {
                result.push(line_start);
                line_start = pos;
            }
            _ if ch > 0x7F && is_line_break(ch) => {
                result.push(line_start);
                line_start = pos;
            }
            _ => {}
        }
    }
    result.push(line_start);
    result
}

pub fn is_line_break(ch: u16) -> bool {
    matches!(ch, 0x0A | 0x0D | 0x2028 | 0x2029)
}

pub fn is_white_space_single_line(ch: u16) -> bool {
    matches!(ch, 0x20 | 0x09 | 0x0B | 0x0C | 0xA0 | 0x85 | 0x1680 | 0x202F | 0x205F | 0x3000 | 0xFEFF) || (0x2000..=0x200B).contains(&ch)
}

pub fn is_white_space_like(ch: u16) -> bool {
    is_white_space_single_line(ch) || is_line_break(ch)
}

fn at(text: &[u16], i: usize) -> u16 {
    text.get(i).copied().unwrap_or(0xFFFF)
}

fn is_conflict_marker_trivia(text: &[u16], pos: usize) -> bool {
    if pos >= text.len() {
        return false;
    }
    let ch = text[pos];
    if pos == 0 || is_line_break(text[pos - 1]) {
        let run = |c: u16| pos + 6 < text.len() && (1..=6).all(|k| text[pos + k] == c);
        if (ch == b'<' as u16 || ch == b'>' as u16 || ch == b'=' as u16) && run(ch) {
            return ch == b'=' as u16 || at(text, pos + 7) == b' ' as u16;
        }
        if ch == b'|' as u16 && run(ch) {
            return true;
        }
    }
    false
}

fn scan_conflict_marker_trivia(text: &[u16], mut pos: usize) -> usize {
    let ch = text[pos];
    if ch == b'<' as u16 || ch == b'>' as u16 {
        while pos < text.len() && !is_line_break(text[pos]) {
            pos += 1;
        }
    } else {
        pos += 7;
        while pos < text.len() {
            let c = text[pos];
            if (c == b'=' as u16 || c == b'>' as u16) && is_conflict_marker_trivia(text, pos) {
                break;
            }
            pos += 1;
        }
    }
    pos
}

/// `skipTrivia(text, pos, stopAfterLineBreak, stopAtComments, inJSDoc)`.
pub fn skip_trivia(text: &[u16], pos: i64, stop_after_line_break: bool, stop_at_comments: bool, in_jsdoc: bool) -> i64 {
    if pos < 0 {
        return pos;
    }
    let mut pos = pos as usize;
    let mut can_consume_star = false;
    loop {
        let ch = at(text, pos);
        match ch {
            0x0D | 0x0A => {
                if ch == 0x0D && at(text, pos + 1) == 0x0A {
                    pos += 1;
                }
                pos += 1;
                if stop_after_line_break {
                    return pos as i64;
                }
                can_consume_star = in_jsdoc;
                continue;
            }
            0x09 | 0x0B | 0x0C | 0x20 => {
                pos += 1;
                continue;
            }
            0x2F => {
                if stop_at_comments {
                    return pos as i64;
                }
                if at(text, pos + 1) == 0x2F {
                    pos += 2;
                    while pos < text.len() && !is_line_break(text[pos]) {
                        pos += 1;
                    }
                    can_consume_star = false;
                    continue;
                }
                if at(text, pos + 1) == 0x2A {
                    pos += 2;
                    while pos < text.len() {
                        if text[pos] == 0x2A && at(text, pos + 1) == 0x2F {
                            pos += 2;
                            break;
                        }
                        pos += 1;
                    }
                    can_consume_star = false;
                    continue;
                }
                return pos as i64;
            }
            0x3C | 0x7C | 0x3D | 0x3E => {
                if is_conflict_marker_trivia(text, pos) {
                    pos = scan_conflict_marker_trivia(text, pos);
                    can_consume_star = false;
                    continue;
                }
                return pos as i64;
            }
            0x23 => {
                if pos == 0 && at(text, 1) == b'!' as u16 {
                    pos += 2;
                    while pos < text.len() && !is_line_break(text[pos]) {
                        pos += 1;
                    }
                    continue;
                }
                return pos as i64;
            }
            0x2A => {
                if can_consume_star {
                    pos += 1;
                    can_consume_star = false;
                    continue;
                }
                return pos as i64;
            }
            _ => {
                if ch != 0xFFFF && ch > 0x7F && is_white_space_like(ch) {
                    pos += 1;
                    continue;
                }
                return pos as i64;
            }
        }
    }
}

/// A comment range: `{kind, pos, end, hasTrailingNewLine}`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CommentRange {
    pub kind: u32,
    pub pos: usize,
    pub end: usize,
    pub has_trailing_new_line: bool,
}

/// `getLeadingCommentRanges(text, pos)` (empty for `undefined`).
pub fn leading_comment_ranges(text: &[u16], pos: i64) -> Vec<CommentRange> {
    comment_ranges(text, pos, false)
}

/// `getTrailingCommentRanges(text, pos)`.
pub fn trailing_comment_ranges(text: &[u16], pos: i64) -> Vec<CommentRange> {
    comment_ranges(text, pos, true)
}

fn comment_ranges(text: &[u16], pos: i64, trailing: bool) -> Vec<CommentRange> {
    let single = tables::kind("SingleLineCommentTrivia").unwrap_or(2);
    let multi = tables::kind("MultiLineCommentTrivia").unwrap_or(3);
    let mut out = Vec::new();
    let mut pending: Option<CommentRange> = None;
    let mut collecting = trailing;
    let mut pos = pos;
    if pos == 0 {
        collecting = true;
        if at(text, 0) == b'#' as u16 && at(text, 1) == b'!' as u16 {
            let mut p = 0;
            while p < text.len() && !is_line_break(text[p]) {
                p += 1;
            }
            pos = p as i64;
        }
    }
    'scan: while pos >= 0 && (pos as usize) < text.len() {
        let mut p = pos as usize;
        let ch = text[p];
        match ch {
            0x0D | 0x0A => {
                if ch == 0x0D && at(text, p + 1) == 0x0A {
                    p += 1;
                }
                pos = p as i64 + 1;
                if trailing {
                    break 'scan;
                }
                collecting = true;
                if let Some(r) = pending.as_mut() {
                    r.has_trailing_new_line = true;
                }
                continue;
            }
            0x09 | 0x0B | 0x0C | 0x20 => {
                pos += 1;
                continue;
            }
            0x2F => {
                let next = at(text, p + 1);
                let mut has_trailing_new_line = false;
                if next == 0x2F || next == 0x2A {
                    let kind = if next == 0x2F { single } else { multi };
                    let start = p;
                    p += 2;
                    if next == 0x2F {
                        while p < text.len() {
                            if is_line_break(text[p]) {
                                has_trailing_new_line = true;
                                break;
                            }
                            p += 1;
                        }
                    } else {
                        while p < text.len() {
                            if text[p] == 0x2A && at(text, p + 1) == 0x2F {
                                p += 2;
                                break;
                            }
                            p += 1;
                        }
                    }
                    if collecting {
                        if let Some(r) = pending.take() {
                            out.push(r);
                        }
                        pending = Some(CommentRange { kind, pos: start, end: p, has_trailing_new_line });
                    }
                    pos = p as i64;
                    continue;
                }
                break 'scan;
            }
            _ => {
                if ch > 0x7F && is_white_space_like(ch) {
                    if is_line_break(ch) {
                        if let Some(r) = pending.as_mut() {
                            r.has_trailing_new_line = true;
                        }
                    }
                    pos += 1;
                    continue;
                }
                break 'scan;
            }
        }
    }
    if let Some(r) = pending {
        out.push(r);
    }
    out
}

/// Every source file read so far, and the accessors over their nodes.
#[derive(Default)]
pub struct Syntax {
    files: Vec<File>,
}

impl Syntax {
    pub fn new() -> Syntax {
        Syntax::default()
    }

    /// Add a binary source file; its `SourceFile` node.
    pub fn add(&mut self, bytes: Vec<u8>) -> V {
        let off_nodes = u32_at(&bytes, HEADER_OFFSET_NODES) as usize;
        let mut file = File {
            off_nodes,
            off_str_offsets: u32_at(&bytes, HEADER_OFFSET_STRING_TABLE_OFFSETS) as usize,
            off_str: u32_at(&bytes, HEADER_OFFSET_STRING_TABLE) as usize,
            off_ext: u32_at(&bytes, HEADER_OFFSET_EXTENDED_DATA) as usize,
            off_structured: u32_at(&bytes, HEADER_OFFSET_STRUCTURED_DATA) as usize,
            data: bytes,
            path: String::new(),
            text16: vec![],
            text: String::new(),
            line_starts: vec![],
        };
        let f = self.files.len() as u32;
        let ext = file.off_ext + (u32_at(&file.data, off_nodes + NODE_LEN + 20) & NODE_EXTENDED_DATA_MASK) as usize;
        let text_index = u32_at(&file.data, ext);
        let path_index = u32_at(&file.data, ext + 8);
        file.text16 = string_units(&file, text_index);
        file.text = String::from_utf16_lossy(&file.text16);
        file.path = String::from_utf16_lossy(&string_units(&file, path_index));
        file.line_starts = line_starts(&file.text16);
        self.files.push(file);
        V::Node(f, 1)
    }

    fn file(&self, f: u32) -> &File {
        &self.files[f as usize]
    }

    fn field(&self, f: u32, i: u32, off: usize) -> u32 {
        let file = self.file(f);
        u32_at(&file.data, file.off_nodes + i as usize * NODE_LEN + off)
    }

    fn count(&self, f: u32) -> u32 {
        let file = self.file(f);
        ((file.data.len() - file.off_nodes) / NODE_LEN) as u32
    }

    fn wrap(&self, f: u32, i: u32) -> V {
        if self.field(f, i, 0) == KIND_NODE_LIST {
            V::List(f, i)
        } else {
            V::Node(f, i)
        }
    }

    /// The source file node of any value's file.
    pub fn source_file(&self, v: &V) -> V {
        v.file().map(|f| V::Node(f, 1)).unwrap_or_default()
    }

    /// The file's path, as the server's handles name it.
    pub fn path(&self, v: &V) -> &str {
        v.file().map(|f| self.file(f).path.as_str()).unwrap_or("")
    }

    /// The file's text, UTF-16.
    pub fn text16(&self, v: &V) -> &[u16] {
        v.file().map(|f| self.file(f).text16.as_slice()).unwrap_or(&[])
    }

    /// The file's text.
    pub fn file_text(&self, v: &V) -> &str {
        v.file().map(|f| self.file(f).text.as_str()).unwrap_or("")
    }

    pub fn kind(&self, v: &V) -> u32 {
        match *v {
            V::Node(f, i) | V::List(f, i) => self.field(f, i, 0),
            V::Undef => u32::MAX - 1,
        }
    }

    pub fn pos(&self, v: &V) -> i64 {
        match *v {
            V::Node(f, i) => self.field(f, i, 4) as i32 as i64,
            V::List(f, i) => self.field(f, i, 4) as i64,
            V::Undef => -1,
        }
    }

    pub fn end(&self, v: &V) -> i64 {
        match *v {
            V::Node(f, i) => self.field(f, i, 8) as i32 as i64,
            V::List(f, i) => self.field(f, i, 8) as i64,
            V::Undef => -1,
        }
    }

    fn next(&self, f: u32, i: u32) -> u32 {
        self.field(f, i, 12)
    }

    fn data(&self, f: u32, i: u32) -> u32 {
        self.field(f, i, 20)
    }

    /// The node flags.
    pub fn flags(&self, v: &V) -> u32 {
        match *v {
            V::Node(f, i) => self.field(f, i, 24),
            _ => 0,
        }
    }

    /// `node.parent`: list containers are skipped.
    pub fn parent(&self, v: &V) -> V {
        let V::Node(f, i) = *v else { return V::Undef };
        if i == 1 {
            return V::Undef;
        }
        let mut p = self.field(f, i, 16);
        while p != i && self.field(f, p, 0) == KIND_NODE_LIST {
            p = self.field(f, p, 16);
        }
        V::Node(f, p)
    }

    /// `node.index` and the handle the server uses: `index.kind.path`.
    pub fn handle(&self, v: &V) -> String {
        match *v {
            V::Node(f, i) => format!("{}.{}.{}", i, self.field(f, i, 0), self.file(f).path),
            _ => String::new(),
        }
    }

    /// The node a handle names, among the files read.
    pub fn resolve(&self, handle: &str) -> V {
        let mut it = handle.splitn(3, '.');
        let (Some(index), Some(_kind), Some(path)) = (it.next(), it.next(), it.next()) else { return V::Undef };
        let Ok(index) = index.parse::<u32>() else { return V::Undef };
        for (f, file) in self.files.iter().enumerate() {
            if file.path == path && index < self.count(f as u32) {
                return V::Node(f as u32, index);
            }
        }
        V::Undef
    }

    fn has_children(&self, f: u32, i: u32) -> bool {
        if i + 1 >= self.count(f) {
            return false;
        }
        self.field(f, i + 1, 16) == i
    }

    fn child_mask(&self, f: u32, i: u32) -> u32 {
        let d = self.data(f, i);
        if d & NODE_DATA_TYPE_MASK != NODE_DATA_TYPE_CHILDREN {
            return 0xFF;
        }
        d & 0xFF
    }

    /// `node[name]` for a child property: a node, a list, or `undefined`.
    pub fn get(&self, v: &V, name: &str) -> V {
        let V::Node(f, i) = *v else { return V::Undef };
        let kind = self.field(f, i, 0);
        let props = tables::child_properties(kind);
        let Some(order) = props.iter().position(|p| *p == name) else {
            debug_assert!(is_child_property_name(name), "not a child property: {name}");
            return V::Undef;
        };
        let mask = self.child_mask(f, i);
        if mask & (1 << order) == 0 {
            return V::Undef;
        }
        let missing = (!(mask | ((0xFFu32 << order) & 0xFF)) & 0xFF).count_ones();
        let property_index = order as u32 - missing;
        let mut child = i + 1;
        for _ in 0..property_index {
            child = self.next(f, child);
        }
        self.wrap(f, child)
    }

    /// The nodes of a list (empty for anything else).
    pub fn items(&self, v: &V) -> Vec<V> {
        let V::List(f, i) = *v else { return vec![] };
        let len = self.data(f, i);
        let mut out = Vec::with_capacity(len as usize);
        if len == 0 {
            return out;
        }
        let mut next = i + 1;
        while next != 0 {
            out.push(V::Node(f, next));
            next = self.next(f, next);
        }
        out
    }

    /// `list.length`.
    pub fn len(&self, v: &V) -> usize {
        match *v {
            V::List(f, i) => self.data(f, i) as usize,
            _ => 0,
        }
    }

    /// The nodes `forEachChild` visits, in order (lists flattened, JSDoc skipped).
    pub fn children(&self, v: &V) -> Vec<V> {
        let V::Node(f, i) = *v else { return vec![] };
        let mut out = Vec::new();
        if !self.has_children(f, i) {
            return out;
        }
        let jsdoc = tables::kind("JSDoc").unwrap_or(u32::MAX);
        let mut next = i + 1;
        loop {
            let kind = self.field(f, next, 0);
            if kind == KIND_NODE_LIST {
                out.extend(self.items(&V::List(f, next)));
            } else if kind != jsdoc {
                out.push(V::Node(f, next));
            }
            next = self.next(f, next);
            if next == 0 {
                break;
            }
        }
        out
    }

    /// `node.jsDoc`: its JSDoc comment nodes.
    pub fn jsdoc(&self, v: &V) -> Vec<V> {
        let V::Node(f, i) = *v else { return vec![] };
        let mut out = Vec::new();
        if !self.has_children(f, i) {
            return out;
        }
        let jsdoc = tables::kind("JSDoc").unwrap_or(u32::MAX);
        let mut next = i + 1;
        loop {
            if self.field(f, next, 0) == jsdoc {
                out.push(V::Node(f, next));
            }
            next = self.next(f, next);
            if next == 0 {
                break;
            }
        }
        out
    }

    fn string(&self, f: u32, index: u32) -> String {
        String::from_utf16_lossy(&string_units(self.file(f), index))
    }

    /// `node.text` for the kinds that carry one; `None` otherwise.
    pub fn text_opt(&self, v: &V) -> Option<String> {
        let V::Node(f, i) = *v else { return None };
        let kind = self.field(f, i, 0);
        let name = tables::kind_name(kind);
        match name {
            "Identifier" | "PrivateIdentifier" | "JsxText" | "JSDocText" | "JSDocLink" | "JSDocLinkPlain" | "JSDocLinkCode" => {
                Some(self.string(f, self.data(f, i) & NODE_STRING_INDEX_MASK))
            }
            "SourceFile" => Some(self.file(f).text.clone()),
            "StringLiteral" | "NumericLiteral" | "BigIntLiteral" | "RegularExpressionLiteral" | "NoSubstitutionTemplateLiteral" | "TemplateHead" | "TemplateMiddle"
            | "TemplateTail" => {
                let file = self.file(f);
                let ext = file.off_ext + (self.data(f, i) & NODE_EXTENDED_DATA_MASK) as usize;
                Some(self.string(f, u32_at(&file.data, ext)))
            }
            _ => None,
        }
    }

    /// `node.text`, `""` when it has none.
    pub fn text(&self, v: &V) -> String {
        self.text_opt(v).unwrap_or_default()
    }

    /// A boolean property stored in the node's data (`isExportEquals`,
    /// `isTypeOnly`, `multiLine`, `isTypeOf`, ...).
    pub fn flag(&self, v: &V, name: &str) -> bool {
        let V::Node(f, i) = *v else { return false };
        let bit = if name == "isNameFirst" { 25 } else { 24 };
        self.data(f, i) & (1 << bit) != 0
    }

    /// `node.operator` (prefix/postfix unary, type operator).
    pub fn operator(&self, v: &V) -> Option<u32> {
        let V::Node(f, i) = *v else { return None };
        let d = self.data(f, i);
        let k = |n: &str| tables::kind(n).unwrap_or(0);
        match tables::kind_name(self.field(f, i, 0)) {
            "PrefixUnaryExpression" => Some(match (d >> 24) & 0x7 {
                1 => k("MinusToken"),
                2 => k("TildeToken"),
                3 => k("ExclamationToken"),
                4 => k("PlusPlusToken"),
                5 => k("MinusMinusToken"),
                _ => k("PlusToken"),
            }),
            "PostfixUnaryExpression" => Some(if (d >> 24) & 1 != 0 { k("MinusMinusToken") } else { k("PlusPlusToken") }),
            "TypeOperator" => Some(match (d >> 24) & 0x3 {
                1 => k("ReadonlyKeyword"),
                2 => k("UniqueKeyword"),
                _ => k("KeyOfKeyword"),
            }),
            _ => None,
        }
    }

    /// `node.token` (heritage clause, import attributes).
    pub fn token(&self, v: &V) -> Option<u32> {
        let V::Node(f, i) = *v else { return None };
        let d = self.data(f, i);
        let k = |n: &str| tables::kind(n).unwrap_or(0);
        match tables::kind_name(self.field(f, i, 0)) {
            "HeritageClause" => Some(if (d >> 24) & 1 != 0 { k("ImplementsKeyword") } else { k("ExtendsKeyword") }),
            "ImportAttributes" => Some(if (d >> 25) & 1 != 0 { k("AssertKeyword") } else { k("WithKeyword") }),
            _ => None,
        }
    }

    /// `node.keyword` (module declaration).
    pub fn keyword(&self, v: &V) -> Option<u32> {
        let V::Node(f, i) = *v else { return None };
        if tables::kind_name(self.field(f, i, 0)) != "ModuleDeclaration" {
            return None;
        }
        let ns = (self.data(f, i) >> 24) & 1 != 0;
        tables::kind(if ns { "NamespaceKeyword" } else { "ModuleKeyword" })
    }

    /// `node.getStart(sf)`.
    pub fn start(&self, v: &V) -> i64 {
        self.token_pos(v, false)
    }

    /// `node.getStart(sf, true)`: from its first JSDoc comment.
    pub fn start_with_jsdoc(&self, v: &V) -> i64 {
        self.token_pos(v, true)
    }

    fn token_pos(&self, v: &V, include_jsdoc: bool) -> i64 {
        let (pos, end, kind) = (self.pos(v), self.end(v), self.kind(v));
        let eof = tables::kind("EndOfFile").unwrap_or(1);
        if pos == end && pos >= 0 && kind != eof {
            return pos;
        }
        let text = self.text16(v);
        let jsx_text = tables::kind("JsxText").unwrap_or(0);
        if (tables::FIRST_JSDOC_NODE..=tables::LAST_JSDOC_NODE).contains(&kind) || kind == jsx_text {
            return skip_trivia(text, pos, false, true, false);
        }
        if include_jsdoc {
            if let Some(first) = self.jsdoc(v).first() {
                return self.token_pos(first, false);
            }
        }
        let jsdoc_flag = tables::NODE_FLAG_JSDOC;
        skip_trivia(text, pos, false, false, self.flags(v) & jsdoc_flag != 0)
    }

    /// `node.getText(sf)`.
    pub fn get_text(&self, v: &V) -> String {
        let text = self.text16(v);
        let (a, b) = (self.start(v).max(0) as usize, self.end(v).max(0) as usize);
        String::from_utf16_lossy(&text[a.min(text.len())..b.min(text.len())])
    }

    /// `sf.getLineAndCharacterOfPosition(pos)`: zero-based line and character.
    pub fn line_and_character(&self, v: &V, pos: usize) -> (usize, usize) {
        let Some(f) = v.file() else { return (0, 0) };
        let starts = &self.file(f).line_starts;
        let line = match starts.binary_search(&pos) {
            Ok(l) => l,
            Err(l) => l - 1,
        };
        (line, pos - starts[line])
    }

    /// A node test by its name in the JS facade (`isIdentifier`).
    pub fn is(&self, name: &str, v: &V) -> bool {
        if !matches!(v, V::Node(..)) {
            return false;
        }
        let kind = self.kind(v);
        if let Some(ks) = tables::test_kinds(name) {
            return ks.contains(&kind);
        }
        let k = |n: &str| tables::kind(n);
        match name {
            "isStringLiteralLike" => Some(kind) == k("StringLiteral") || Some(kind) == k("NoSubstitutionTemplateLiteral"),
            "isMethodSignature" => Some(kind) == k("MethodSignature"),
            "isPropertySignature" => Some(kind) == k("PropertySignature"),
            "isParameter" => Some(kind) == k("Parameter"),
            "isTypeAssertionExpression" => Some(kind) == k("TypeAssertionExpression"),
            "isTypeElement" => ["PropertySignature", "MethodSignature", "CallSignature", "ConstructSignature", "IndexSignature"].iter().any(|n| Some(kind) == k(n)),
            "isFunctionLike" => [
                "MethodSignature",
                "CallSignature",
                "JSDocSignature",
                "ConstructSignature",
                "IndexSignature",
                "FunctionType",
                "ConstructorType",
                "FunctionDeclaration",
                "MethodDeclaration",
                "Constructor",
                "GetAccessor",
                "SetAccessor",
                "FunctionExpression",
                "ArrowFunction",
            ]
            .iter()
            .any(|n| Some(kind) == k(n)),
            "isClassLike" => Some(kind) == k("ClassDeclaration") || Some(kind) == k("ClassExpression"),
            "isEntityNameExpression" => self.is_entity_name_expression(v),
            "isConstTypeReference" => {
                let name = self.get(v, "typeName");
                Some(kind) == k("TypeReference") && self.is("isIdentifier", &name) && self.text(&name) == "const" && self.get(v, "typeArguments").is_undefined()
            }
            "isGlobalScopeAugmentation" => {
                let name = self.get(v, "name");
                Some(kind) == k("ModuleDeclaration") && self.is("isIdentifier", &name) && self.text(&name) == "global"
            }
            _ => {
                debug_assert!(false, "no node test {name}");
                false
            }
        }
    }
}

impl Syntax {
    fn is_entity_name_expression(&self, v: &V) -> bool {
        let kind = self.kind(v);
        if Some(kind) == tables::kind("Identifier") {
            return true;
        }
        if Some(kind) != tables::kind("PropertyAccessExpression") {
            return false;
        }
        let name = self.get(v, "name");
        self.is("isIdentifier", &name) && self.is_entity_name_expression(&self.get(v, "expression"))
    }

    fn sf_ext(&self, f: u32) -> usize {
        let file = self.file(f);
        file.off_ext + (u32_at(&file.data, file.off_nodes + NODE_LEN + 20) & NODE_EXTENDED_DATA_MASK) as usize
    }

    /// A source file's `fileName`.
    pub fn file_name(&self, v: &V) -> String {
        let Some(f) = v.file() else { return String::new() };
        let ext = self.sf_ext(f);
        self.string(f, u32_at(&self.file(f).data, ext + 4))
    }

    /// A source file's `externalModuleIndicator`: `None` when unset,
    /// `Some(V::Undef)` for `true` (the file itself), else the node.
    pub fn external_module_indicator(&self, v: &V) -> Option<V> {
        let f = v.file()?;
        let ext = self.sf_ext(f);
        match u32_at(&self.file(f).data, ext + 44) {
            0 => None,
            1 => Some(V::Undef),
            i => Some(V::Node(f, i)),
        }
    }
}

/// A file reference (`/// <reference ...>`): `{pos, end, fileName, resolutionMode, preserve}`.
#[derive(Clone, Debug)]
pub struct FileReference {
    pub pos: u64,
    pub end: u64,
    pub file_name: String,
    pub resolution_mode: u64,
    pub preserve: bool,
}

struct Msgpack<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl Msgpack<'_> {
    fn byte(&mut self) -> u8 {
        let b = self.buf.get(self.pos).copied().unwrap_or(0xc1);
        self.pos += 1;
        b
    }
    fn be(&mut self, n: usize) -> u64 {
        let mut v = 0u64;
        for _ in 0..n {
            v = (v << 8) | self.byte() as u64;
        }
        v
    }
    fn array(&mut self) -> usize {
        match self.byte() {
            b if b & 0xf0 == 0x90 => (b & 0x0f) as usize,
            0xdc => self.be(2) as usize,
            0xdd => self.be(4) as usize,
            _ => 0,
        }
    }
    fn uint(&mut self) -> u64 {
        match self.byte() {
            b if b <= 0x7f => b as u64,
            0xcc => self.be(1),
            0xcd => self.be(2),
            0xce => self.be(4),
            0xcf => self.be(8),
            _ => 0,
        }
    }
    fn string(&mut self) -> String {
        let len = match self.byte() {
            b if b & 0xe0 == 0xa0 => (b & 0x1f) as usize,
            0xd9 => self.be(1) as usize,
            0xda => self.be(2) as usize,
            0xdb => self.be(4) as usize,
            _ => 0,
        };
        let end = (self.pos + len).min(self.buf.len());
        let s = String::from_utf16_lossy(&wtf8_to_utf16(&self.buf[self.pos..end]));
        self.pos = end;
        s
    }
    fn boolean(&mut self) -> bool {
        self.byte() == 0xc3
    }
}

impl Syntax {
    fn structured(&self, v: &V, slot: usize) -> Option<(u32, Msgpack<'_>)> {
        let f = v.file()?;
        let ext = self.sf_ext(f);
        let file = self.file(f);
        let offset = u32_at(&file.data, ext + slot);
        if offset == NO_STRUCTURED_DATA {
            return None;
        }
        Some((f, Msgpack { buf: &file.data, pos: file.off_structured + offset as usize }))
    }

    fn file_references(&self, v: &V, slot: usize) -> Vec<FileReference> {
        let Some((_, mut r)) = self.structured(v, slot) else { return vec![] };
        let n = r.array();
        (0..n)
            .map(|_| {
                r.array();
                FileReference { pos: r.uint(), end: r.uint(), file_name: r.string(), resolution_mode: r.uint(), preserve: r.boolean() }
            })
            .collect()
    }

    /// `sf.referencedFiles`.
    pub fn referenced_files(&self, v: &V) -> Vec<FileReference> {
        self.file_references(v, 20)
    }
    /// `sf.typeReferenceDirectives`.
    pub fn type_reference_directives(&self, v: &V) -> Vec<FileReference> {
        self.file_references(v, 24)
    }
    /// `sf.libReferenceDirectives`.
    pub fn lib_reference_directives(&self, v: &V) -> Vec<FileReference> {
        self.file_references(v, 28)
    }
    /// `sf.imports`: the module specifier literals.
    pub fn imports(&self, v: &V) -> Vec<V> {
        let Some((f, mut r)) = self.structured(v, 32) else { return vec![] };
        let n = r.array();
        (0..n).map(|_| V::Node(f, r.uint() as u32)).collect()
    }
    /// `sf.moduleAugmentations`.
    pub fn module_augmentations(&self, v: &V) -> Vec<V> {
        let Some((f, mut r)) = self.structured(v, 36) else { return vec![] };
        let n = r.array();
        (0..n).map(|_| V::Node(f, r.uint() as u32)).collect()
    }
}

impl Syntax {
    fn k(&self, name: &str) -> u32 {
        tables::kind(name).unwrap_or(u32::MAX)
    }

    fn jsdoc_nodes(&self, v: &V) -> Vec<V> {
        let j = self.k("JSDoc");
        self.jsdoc(v).into_iter().filter(|d| self.kind(d) == j).collect()
    }

    fn owns_jsdoc_tag(&self, host: &V, tag: &V) -> bool {
        let tk = self.kind(tag);
        if tk != self.k("JSDocTypeTag") && tk != self.k("JSDocSatisfiesTag") {
            return true;
        }
        let p = self.parent(tag);
        if p.is_undefined() || self.kind(&p) != self.k("JSDoc") {
            return true;
        }
        let pp = self.parent(&p);
        pp.is_undefined() || self.kind(&pp) != self.k("ParenthesizedExpression") || pp == *host
    }

    fn filter_owned_jsdoc_tags(&self, host: &V, comments: &[V]) -> Vec<V> {
        let mut out = Vec::new();
        let last = comments.last().copied();
        for d in comments {
            let tags = self.get(d, "tags");
            if tags.is_undefined() {
                continue;
            }
            for tag in self.items(&tags) {
                if Some(*d) == last {
                    if self.owns_jsdoc_tag(host, &tag) {
                        out.push(tag);
                    }
                } else if self.kind(&tag) == self.k("JSDocOverloadTag") {
                    out.push(tag);
                }
            }
        }
        out
    }

    fn next_jsdoc_comment_location(&self, node: &V) -> V {
        let parent = self.parent(node);
        if parent.is_undefined() {
            return V::Undef;
        }
        let pk = self.kind(&parent);
        let hits = ["PropertyAssignment", "ExportAssignment", "PropertyDeclaration", "VariableDeclaration", "SatisfiesExpression", "ReturnStatement", "VariableStatement", "ExpressionStatement"];
        if hits.iter().any(|n| self.k(n) == pk) {
            return parent;
        }
        if pk == self.k("VariableDeclarationList") && self.items(&self.get(&parent, "declarations")).first() == Some(node) {
            return parent;
        }
        V::Undef
    }

    /// `getJSDocTags(node)` (TypeScript 7's `getJSDocCommentsAndTags`).
    pub fn jsdoc_tags(&self, host: &V) -> Vec<V> {
        let mut out = Vec::new();
        let variable_like = ["BindingElement", "EnumMember", "Parameter", "PropertyAssignment", "PropertyDeclaration", "PropertySignature", "ShorthandPropertyAssignment", "VariableDeclaration"];
        if variable_like.iter().any(|n| self.k(n) == self.kind(host)) {
            let init = self.get(host, "initializer");
            if !init.is_undefined() {
                let nodes = self.jsdoc_nodes(&init);
                if !nodes.is_empty() {
                    out.extend(self.filter_owned_jsdoc_tags(host, &nodes));
                }
            }
        }
        let mut node = *host;
        while !node.is_undefined() && !self.parent(&node).is_undefined() {
            let nodes = self.jsdoc_nodes(&node);
            if !nodes.is_empty() {
                out.extend(self.filter_owned_jsdoc_tags(host, &nodes));
            }
            let nk = self.kind(&node);
            if nk == self.k("Parameter") {
                out.extend(self.jsdoc_parameter_tags(&node));
                break;
            }
            if nk == self.k("TypeParameter") {
                let name = self.text(&self.get(&node, "name"));
                for tag in self.jsdoc_tags(&self.parent(&node)) {
                    if self.kind(&tag) == self.k("JSDocTemplateTag") && self.items(&self.get(&tag, "typeParameters")).iter().any(|tp| self.text(&self.get(tp, "name")) == name) {
                        out.push(tag);
                    }
                }
                break;
            }
            node = self.next_jsdoc_comment_location(&node);
        }
        out
    }

    fn jsdoc_parameter_tags(&self, param: &V) -> Vec<V> {
        let mut out = Vec::new();
        let name = self.get(param, "name");
        let parent = self.parent(param);
        let parent_tags = self.jsdoc_tags(&parent);
        let ptk = self.k("JSDocParameterTag");
        if self.is("isIdentifier", &name) {
            for tag in parent_tags {
                let tn = self.get(&tag, "name");
                if self.kind(&tag) == ptk && self.is("isIdentifier", &tn) && self.text(&tn) == self.text(&name) {
                    out.push(tag);
                }
            }
        } else if !name.is_undefined() {
            let params = self.items(&self.get(&parent, "parameters"));
            if let Some(i) = params.iter().position(|p| p == param) {
                let pts: Vec<V> = parent_tags.into_iter().filter(|t| self.kind(t) == ptk).collect();
                if i < pts.len() {
                    out.push(pts[i]);
                }
            }
        }
        out
    }
}

fn string_units(file: &File, index: u32) -> Vec<u16> {
    let at = file.off_str_offsets + index as usize * 4;
    let start = u32_at(&file.data, at) as usize;
    let end = u32_at(&file.data, at + 4) as usize;
    wtf8_to_utf16(&file.data[file.off_str + start..file.off_str + end])
}

fn is_child_property_name(name: &str) -> bool {
    (0..400u32).any(|k| tables::child_properties(k).contains(&name))
}
