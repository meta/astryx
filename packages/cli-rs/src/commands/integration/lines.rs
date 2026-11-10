//! A port of the line model that recast (the source printer the JS CLI uses
//! to patch integration manifests) prints with. The patched manifest must
//! match byte for byte, so indentation, slicing and joining follow recast's
//! rules exactly. Text is held in UTF-16 code units, as in JavaScript.

#[derive(Clone, Debug)]
pub struct Info {
    pub line: std::rc::Rc<Vec<u16>>,
    pub indent: i64,
    pub locked: bool,
    pub slice_start: usize,
    pub slice_end: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Pos {
    pub line: usize,
    pub column: i64,
}

#[derive(Clone, Debug)]
pub struct Lines {
    pub infos: Vec<Info>,
}

/// JavaScript `\s`.
pub fn js_space(c: u16) -> bool {
    matches!(
        c,
        0x09 | 0x0A | 0x0B | 0x0C | 0x0D | 0x20 | 0xA0 | 0x1680 | 0x2028 | 0x2029 | 0x202F | 0x205F | 0x3000 | 0xFEFF
    ) || (0x2000..=0x200A).contains(&c)
}

fn only_ws(s: &[u16]) -> bool {
    s.iter().all(|c| js_space(*c))
}

pub fn count_spaces(spaces: &[u16], tab_width: usize) -> i64 {
    let mut count: i64 = 0;
    let tw = tab_width.max(1) as i64;
    for &c in spaces {
        match c {
            9 => {
                let next = ((count + tw - 1) / tw) * tw;
                if next == count {
                    count += tw;
                } else {
                    count = next;
                }
            }
            11 | 12 | 13 | 0xFEFF => {}
            _ => count += 1,
        }
    }
    count
}

/// Split on JS line terminators: CRLF, lone CR, LF, U+2028, U+2029.
pub fn split_lines(s: &[u16]) -> Vec<Vec<u16>> {
    let mut out = Vec::new();
    let mut cur = Vec::new();
    let mut i = 0;
    while i < s.len() {
        let c = s[i];
        if c == 0x0D {
            out.push(std::mem::take(&mut cur));
            if i + 1 < s.len() && s[i + 1] == 0x0A {
                i += 1;
            }
        } else if c == 0x0A || c == 0x2028 || c == 0x2029 {
            out.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
        i += 1;
    }
    out.push(cur);
    out
}

fn slice_info(info: &Info, start_col: i64, end_col: Option<i64>) -> Info {
    let mut slice_start = info.slice_start as i64;
    let mut slice_end = info.slice_end as i64;
    let mut indent = info.indent.max(0);
    let mut line_length = indent + slice_end - slice_start;
    let mut end_col = end_col.unwrap_or(line_length);
    let mut start_col = start_col.max(0);
    end_col = end_col.min(line_length);
    end_col = end_col.max(start_col);
    if end_col < indent {
        indent = end_col;
        slice_end = slice_start;
    } else {
        slice_end -= line_length - end_col;
    }
    line_length = end_col;
    let _ = line_length;
    if start_col < indent {
        indent -= start_col;
    } else {
        start_col -= indent;
        indent = 0;
        slice_start += start_col;
    }
    if info.indent == indent && info.slice_start as i64 == slice_start && info.slice_end as i64 == slice_end {
        return info.clone();
    }
    Info { line: info.line.clone(), indent, locked: false, slice_start: slice_start as usize, slice_end: slice_end as usize }
}

impl Lines {
    pub fn from_u16(s: &[u16], tab_width: usize) -> Lines {
        let infos = split_lines(s)
            .into_iter()
            .map(|line| {
                let n = line.iter().take_while(|c| js_space(**c)).count();
                let indent = count_spaces(&line[..n], tab_width);
                let len = line.len();
                Info { line: std::rc::Rc::new(line), indent, locked: false, slice_start: n, slice_end: len }
            })
            .collect();
        Lines { infos }
    }

    pub fn from_str(s: &str) -> Lines {
        let u: Vec<u16> = s.encode_utf16().collect();
        Lines::from_u16(&u, 4)
    }

    pub fn len(&self) -> usize {
        self.infos.len()
    }

    pub fn indent_at(&self, line: usize) -> i64 {
        self.infos[line - 1].indent.max(0)
    }

    pub fn line_length(&self, line: usize) -> i64 {
        let info = &self.infos[line - 1];
        self.indent_at(line) + info.slice_end as i64 - info.slice_start as i64
    }

    pub fn is_empty(&self) -> bool {
        self.len() < 2 && self.line_length(1) < 1
    }

    pub fn first_pos(&self) -> Pos {
        Pos { line: 1, column: 0 }
    }

    pub fn last_pos(&self) -> Pos {
        Pos { line: self.len(), column: self.line_length(self.len()) }
    }

    /// The character at `pos`, as recast's `charAt` returns it (`None` for "").
    pub fn char_at(&self, pos: Pos) -> Option<u16> {
        if pos.line < 1 || pos.line > self.len() || pos.column < 0 {
            return None;
        }
        let info = &self.infos[pos.line - 1];
        let indent = self.indent_at(pos.line);
        let mut c = pos.column;
        if c < indent {
            return Some(0x20);
        }
        c += info.slice_start as i64 - indent;
        if c == info.slice_end as i64 && pos.line < self.len() {
            return Some(0x0A);
        }
        if c >= info.slice_end as i64 {
            return None;
        }
        Some(info.line[c as usize])
    }

    fn is_ws_at(&self, pos: Pos) -> bool {
        // recast: isOnlyWhitespace(charAt(pos)); "" counts as whitespace.
        match self.char_at(pos) {
            None => true,
            Some(c) => js_space(c),
        }
    }

    pub fn next_pos(&self, pos: &mut Pos) -> bool {
        let l = pos.line;
        let c = pos.column.max(0);
        if c < self.line_length(l) {
            pos.column += 1;
            return true;
        }
        if l < self.len() {
            pos.line += 1;
            pos.column = 0;
            return true;
        }
        false
    }

    pub fn prev_pos(&self, pos: &mut Pos) -> bool {
        let mut l = pos.line;
        let mut c = pos.column;
        if c < 1 {
            if l <= 1 {
                return false;
            }
            l -= 1;
            c = self.line_length(l);
        } else {
            c = (c - 1).min(self.line_length(l));
        }
        pos.line = l;
        pos.column = c;
        true
    }

    pub fn skip_spaces(&self, pos: Pos, backward: bool) -> Option<Pos> {
        let mut pos = pos;
        if backward {
            while self.prev_pos(&mut pos) {
                if !self.is_ws_at(pos) && self.next_pos(&mut pos) {
                    return Some(pos);
                }
            }
            None
        } else {
            while self.is_ws_at(pos) {
                if !self.next_pos(&mut pos) {
                    return None;
                }
            }
            Some(pos)
        }
    }

    pub fn slice(&self, start: Pos, end: Pos) -> Lines {
        let mut sliced: Vec<Info> = self.infos[start.line - 1..end.line].to_vec();
        if start.line == end.line {
            sliced[0] = slice_info(&sliced[0], start.column, Some(end.column));
        } else {
            sliced[0] = slice_info(&sliced[0], start.column, None);
            let last = sliced.pop().unwrap();
            sliced.push(slice_info(&last, 0, Some(end.column)));
        }
        Lines { infos: sliced }
    }

    pub fn indent(&self, by: i64) -> Lines {
        if by == 0 {
            return self.clone();
        }
        Lines {
            infos: self
                .infos
                .iter()
                .map(|i| {
                    let mut i = i.clone();
                    if !i.line.is_empty() && !i.locked {
                        i.indent += by;
                    }
                    i
                })
                .collect(),
        }
    }

    pub fn indent_tail(&self, by: i64) -> Lines {
        if by == 0 || self.len() < 2 {
            return self.clone();
        }
        Lines {
            infos: self
                .infos
                .iter()
                .enumerate()
                .map(|(n, i)| {
                    let mut i = i.clone();
                    if n > 0 && !i.line.is_empty() && !i.locked {
                        i.indent += by;
                    }
                    i
                })
                .collect(),
        }
    }

    /// `separator.join(elements)`, as recast joins line objects.
    pub fn join(sep: &Lines, elements: Vec<Lines>) -> Lines {
        let mut infos: Vec<Info> = Vec::new();
        let sep_empty = sep.is_empty();
        fn append(infos: &mut Vec<Info>, lines: &Lines) {
            let mut skip_first = false;
            if let Some(prev) = infos.last_mut() {
                let info = &lines.infos[0];
                let mut nl: Vec<u16> = prev.line[..prev.slice_end].to_vec();
                for _ in 0..info.indent.max(0) {
                    nl.push(0x20);
                }
                nl.extend_from_slice(&info.line[info.slice_start..info.slice_end]);
                prev.locked = prev.locked || info.locked;
                prev.slice_end = nl.len();
                prev.line = std::rc::Rc::new(nl);
                skip_first = true;
            }
            for (i, info) in lines.infos.iter().enumerate() {
                if i == 0 && skip_first {
                    continue;
                }
                infos.push(info.clone());
            }
        }
        let mut first = true;
        for el in elements.iter() {
            if el.is_empty() {
                // A null element still counts for the separator index in
                // recast only through `i`; it appends the separator when i > 0.
                if !sep_empty && !first {
                    append(&mut infos, sep);
                }
                first = false;
                continue;
            }
            if !sep_empty && !first {
                append(&mut infos, sep);
            }
            append(&mut infos, el);
            first = false;
        }
        if infos.is_empty() {
            return Lines::from_str("");
        }
        Lines { infos }
    }

    pub fn concat(elements: Vec<Lines>) -> Lines {
        Lines::join(&Lines::from_str(""), elements)
    }

    pub fn to_string_with(&self, tab_width: usize) -> String {
        let start = self.first_pos();
        let end = self.last_pos();
        let mut parts: Vec<Vec<u16>> = Vec::new();
        for line in start.line..=end.line {
            let mut info = self.infos[line - 1].clone();
            if line == start.line {
                if line == end.line {
                    info = slice_info(&info, start.column, Some(end.column));
                } else {
                    info = slice_info(&info, start.column, None);
                }
            } else if line == end.line {
                info = slice_info(&info, 0, Some(end.column));
            }
            let indent = info.indent.max(0);
            let before = &info.line[..info.slice_start];
            if only_ws(before) && count_spaces(before, tab_width) == indent {
                parts.push(info.line[..info.slice_end].to_vec());
                continue;
            }
            let mut r: Vec<u16> = Vec::new();
            for _ in 0..indent {
                r.push(0x20);
            }
            r.extend_from_slice(&info.line[info.slice_start..info.slice_end]);
            parts.push(r);
        }
        let mut out: Vec<u16> = Vec::new();
        for (i, p) in parts.iter().enumerate() {
            if i > 0 {
                out.push(0x0A);
            }
            out.extend_from_slice(p);
        }
        String::from_utf16_lossy(&out)
    }

    pub fn guess_tab_width(&self) -> usize {
        let mut counts: std::collections::BTreeMap<i64, i64> = Default::default();
        let mut last_indent = 0i64;
        for info in &self.infos {
            let sliced = &info.line[info.slice_start..info.slice_end];
            if only_ws(sliced) {
                continue;
            }
            let diff = (info.indent - last_indent).abs();
            *counts.entry(diff).or_insert(0) += 1;
            last_indent = info.indent;
        }
        let mut max_count = -1;
        let mut result = 2usize;
        for (&tw, &c) in &counts {
            if tw >= 1 && c > max_count {
                max_count = c;
                result = tw as usize;
            }
        }
        result
    }

    pub fn is_preceded_only_by_whitespace(&self, pos: Pos) -> bool {
        let info = &self.infos[pos.line - 1];
        let indent = info.indent.max(0);
        let diff = pos.column - indent;
        if diff <= 0 {
            return true;
        }
        let start = info.slice_start;
        let end = (start + diff as usize).min(info.slice_end);
        only_ws(&info.line[start..end])
    }

    /// The first line's length, as `getLineLength(1)`.
    pub fn first_line_length(&self) -> i64 {
        self.line_length(1)
    }
}
