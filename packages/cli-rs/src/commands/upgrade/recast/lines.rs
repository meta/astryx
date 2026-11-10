//! A port of recast's `Lines`: text as indented line slices, in UTF-16 code
//! units, so columns match the JavaScript printer exactly.

use std::rc::Rc;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Default)]
pub struct Pos {
    pub line: usize,
    pub column: usize,
}

impl Pos {
    pub fn new(line: usize, column: usize) -> Pos {
        Pos { line, column }
    }
}

pub fn compare_pos(a: Pos, b: Pos) -> std::cmp::Ordering {
    (a.line, a.column).cmp(&(b.line, b.column))
}

#[derive(Clone, Debug)]
pub struct Info {
    pub line: Rc<Vec<u16>>,
    pub indent: i64,
    pub locked: bool,
    pub slice_start: usize,
    pub slice_end: usize,
}

#[derive(Clone, Debug)]
pub struct Lines {
    pub infos: Vec<Info>,
}

pub fn is_ws_unit(c: u16) -> bool {
    // JS `\s`
    matches!(
        c,
        0x09 | 0x0a | 0x0b | 0x0c | 0x0d | 0x20 | 0xa0 | 0x1680 | 0x2000..=0x200a | 0x2028 | 0x2029 | 0x202f | 0x205f | 0x3000 | 0xfeff
    )
}

pub fn is_only_whitespace(s: &[u16]) -> bool {
    s.iter().all(|&c| is_ws_unit(c))
}

pub fn count_spaces(spaces: &[u16], tab_width: usize) -> i64 {
    let mut count: i64 = 0;
    let tw = tab_width as i64;
    for &c in spaces {
        match c {
            9 => {
                let next = if tw == 0 { count } else { ((count as f64 / tw as f64).ceil() as i64) * tw };
                if next == count {
                    count += tw;
                } else {
                    count = next;
                }
            }
            11 | 12 | 13 | 0xfeff => {}
            _ => count += 1,
        }
    }
    count
}

pub fn utf16(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}

/// Split on JS line terminators: \r\n, \r, \n, \u2028, \u2029.
pub fn split_lines(s: &[u16]) -> Vec<Vec<u16>> {
    let mut out = Vec::new();
    let mut cur = Vec::new();
    let mut i = 0;
    while i < s.len() {
        let c = s[i];
        if c == 0x0d {
            out.push(std::mem::take(&mut cur));
            if i + 1 < s.len() && s[i + 1] == 0x0a {
                i += 1;
            }
        } else if c == 0x0a || c == 0x2028 || c == 0x2029 {
            out.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
        i += 1;
    }
    out.push(cur);
    out
}

impl Lines {
    pub fn from_str(s: &str) -> Lines {
        Lines::from_utf16(&utf16(s), None)
    }

    pub fn from_str_tab(s: &str, tab_width: usize) -> Lines {
        Lines::from_utf16(&utf16(s), Some(tab_width))
    }

    /// `fromString(string, options)`; `tab_width` None means options absent
    /// (countSpaces with an undefined tab width, where tabs count as NaN steps).
    pub fn from_utf16(s: &[u16], tab_width: Option<usize>) -> Lines {
        let infos = split_lines(s)
            .into_iter()
            .map(|line| {
                let n = line.iter().take_while(|&&c| is_ws_unit(c)).count();
                let indent = match tab_width {
                    Some(tw) => count_spaces(&line[..n], tw),
                    None => count_spaces_undefined(&line[..n]),
                };
                let len = line.len();
                Info { line: Rc::new(line), indent, locked: false, slice_start: n, slice_end: len }
            })
            .collect();
        Lines { infos }
    }

    pub fn empty() -> Lines {
        Lines::from_str("")
    }

    pub fn len(&self) -> usize {
        self.infos.len()
    }

    pub fn get_indent_at(&self, line: usize) -> usize {
        self.infos[line - 1].indent.max(0) as usize
    }

    pub fn get_line_length(&self, line: usize) -> usize {
        let info = &self.infos[line - 1];
        self.get_indent_at(line) + info.slice_end - info.slice_start
    }

    pub fn first_pos(&self) -> Pos {
        Pos::new(1, 0)
    }

    pub fn last_pos(&self) -> Pos {
        Pos::new(self.len(), self.get_line_length(self.len()))
    }

    /// Returns the UTF-16 unit at pos, '\n' at line ends, or None.
    pub fn char_at(&self, pos: Pos) -> Option<u16> {
        if pos.line == 0 || pos.line > self.infos.len() {
            return None;
        }
        let info = &self.infos[pos.line - 1];
        let indent = self.get_indent_at(pos.line);
        let c = pos.column;
        if c < indent {
            return Some(b' ' as u16);
        }
        let c = c + info.slice_start - indent;
        if c == info.slice_end && pos.line < self.len() {
            return Some(b'\n' as u16);
        }
        if c >= info.slice_end {
            return None;
        }
        Some(info.line[c])
    }

    pub fn char_is_ws_or_empty(&self, pos: Pos) -> bool {
        match self.char_at(pos) {
            None => true,
            Some(c) => is_ws_unit(c),
        }
    }

    pub fn next_pos(&self, pos: &mut Pos, skip_spaces: bool) -> bool {
        let l = pos.line;
        let c = pos.column;
        if c < self.get_line_length(l) {
            pos.column += 1;
            return if skip_spaces { self.skip_spaces_in_place(pos, false) } else { true };
        }
        if l < self.len() {
            pos.line += 1;
            pos.column = 0;
            return if skip_spaces { self.skip_spaces_in_place(pos, false) } else { true };
        }
        false
    }

    pub fn prev_pos(&self, pos: &mut Pos, skip_spaces: bool) -> bool {
        let mut l = pos.line;
        let c;
        if pos.column < 1 {
            if l <= 1 {
                return false;
            }
            l -= 1;
            c = self.get_line_length(l);
        } else {
            c = (pos.column - 1).min(self.get_line_length(l));
        }
        pos.line = l;
        pos.column = c;
        if skip_spaces {
            self.skip_spaces_in_place(pos, true)
        } else {
            true
        }
    }

    fn skip_spaces_in_place(&self, pos: &mut Pos, backward: bool) -> bool {
        match self.skip_spaces(Some(*pos), backward) {
            Some(p) => {
                *pos = p;
                true
            }
            None => false,
        }
    }

    pub fn skip_spaces(&self, pos: Option<Pos>, backward: bool) -> Option<Pos> {
        let mut pos = match pos {
            Some(p) => p,
            None => {
                if backward {
                    self.last_pos()
                } else {
                    self.first_pos()
                }
            }
        };
        if backward {
            while self.prev_pos(&mut pos, false) {
                if !self.char_is_ws_or_empty(pos) && self.next_pos(&mut pos, false) {
                    return Some(pos);
                }
            }
            None
        } else {
            while self.char_is_ws_or_empty(pos) {
                if !self.next_pos(&mut pos, false) {
                    return None;
                }
            }
            Some(pos)
        }
    }

    pub fn is_preceded_only_by_whitespace(&self, pos: Pos) -> bool {
        let info = &self.infos[pos.line - 1];
        let indent = info.indent.max(0) as usize;
        if pos.column <= indent {
            return true;
        }
        let diff = pos.column - indent;
        let start = info.slice_start;
        let end = (start + diff).min(info.slice_end);
        is_only_whitespace(&info.line[start..end])
    }

    pub fn starts_with_comment(&self) -> bool {
        if self.infos.is_empty() {
            return false;
        }
        let i = &self.infos[0];
        let s = String::from_utf16_lossy(&i.line[i.slice_start..i.slice_end]);
        let t = js_trim(&s);
        t.is_empty() || t.starts_with("//") || t.starts_with("/*")
    }

    pub fn is_empty(&self) -> bool {
        self.len() < 2 && self.get_line_length(1) < 1
    }

    pub fn guess_tab_width(&self) -> usize {
        let mut counts: Vec<usize> = Vec::new();
        let mut last_indent: i64 = 0;
        for info in &self.infos {
            if is_only_whitespace(&info.line[info.slice_start..info.slice_end]) {
                continue;
            }
            let diff = (info.indent - last_indent).unsigned_abs() as usize;
            if counts.len() <= diff {
                counts.resize(diff + 1, 0);
            }
            counts[diff] += 1;
            last_indent = info.indent;
        }
        let mut max_count: i64 = -1;
        let mut result = 2;
        for (tw, &c) in counts.iter().enumerate().skip(1) {
            if c > 0 && c as i64 > max_count {
                max_count = c as i64;
                result = tw;
            }
        }
        result
    }

    fn map_infos(&self, f: impl Fn(usize, &Info) -> Info) -> Lines {
        Lines { infos: self.infos.iter().enumerate().map(|(i, info)| f(i, info)).collect() }
    }

    pub fn indent(&self, by: i64) -> Lines {
        if by == 0 {
            return self.clone();
        }
        self.map_infos(|_, info| {
            let mut info = info.clone();
            if !info.line.is_empty() && !info.locked {
                info.indent += by;
            }
            info
        })
    }

    pub fn indent_tail(&self, by: i64) -> Lines {
        if by == 0 || self.len() < 2 {
            return self.clone();
        }
        self.map_infos(|i, info| {
            let mut info = info.clone();
            if i > 0 && !info.line.is_empty() && !info.locked {
                info.indent += by;
            }
            info
        })
    }

    pub fn lock_indent_tail(&self) -> Lines {
        if self.len() < 2 {
            return self.clone();
        }
        self.map_infos(|i, info| {
            let mut info = info.clone();
            info.locked = i > 0;
            info
        })
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

    pub fn slice_from(&self, start: Pos) -> Lines {
        self.slice(start, self.last_pos())
    }

    pub fn slice_string(&self, start: Pos, end: Pos, opts: &PrintOpts) -> String {
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
            if opts.reuse_whitespace && is_only_whitespace(before) && count_spaces(before, opts.tab_width) == indent {
                parts.push(info.line[..info.slice_end].to_vec());
                continue;
            }
            let mut tabs = 0;
            let mut spaces = indent;
            if opts.use_tabs {
                tabs = indent / opts.tab_width as i64;
                spaces -= tabs * opts.tab_width as i64;
            }
            let mut result: Vec<u16> = Vec::new();
            for _ in 0..tabs {
                result.push(9);
            }
            for _ in 0..spaces {
                result.push(32);
            }
            result.extend_from_slice(&info.line[info.slice_start..info.slice_end]);
            parts.push(result);
        }
        let mut out: Vec<u16> = Vec::new();
        let term = utf16(&opts.line_terminator);
        for (i, p) in parts.iter().enumerate() {
            if i > 0 {
                out.extend_from_slice(&term);
            }
            out.extend_from_slice(p);
        }
        String::from_utf16_lossy(&out)
    }

    pub fn to_string_opts(&self, opts: &PrintOpts) -> String {
        self.slice_string(self.first_pos(), self.last_pos(), opts)
    }

    pub fn to_js_string(&self) -> String {
        self.to_string_opts(&PrintOpts::default())
    }

    /// `separator.join(elements)`
    pub fn join(&self, elements: &[Lines]) -> Lines {
        let sep_empty = self.is_empty();
        let mut infos: Vec<Info> = Vec::new();
        let mut have_prev = false;
        let mut append = |lines: &Lines, infos: &mut Vec<Info>| {
            if have_prev {
                let info = &lines.infos[0];
                let prev = infos.last_mut().unwrap();
                let mut nl: Vec<u16> = prev.line[..prev.slice_end].to_vec();
                for _ in 0..info.indent.max(0) {
                    nl.push(32);
                }
                nl.extend_from_slice(&info.line[info.slice_start..info.slice_end]);
                prev.locked = prev.locked || info.locked;
                prev.slice_end = nl.len();
                prev.line = Rc::new(nl);
            }
            for (i, info) in lines.infos.iter().enumerate() {
                if !have_prev || i > 0 {
                    infos.push(info.clone());
                    have_prev = true;
                }
            }
        };
        let mut idx = 0;
        for elem in elements {
            let non_empty = !elem.is_empty();
            if sep_empty {
                if non_empty {
                    append(elem, &mut infos);
                }
            } else {
                if idx > 0 {
                    append(self, &mut infos);
                }
                if non_empty {
                    append(elem, &mut infos);
                }
            }
            idx += 1;
        }
        if infos.is_empty() {
            return Lines::empty();
        }
        Lines { infos }
    }

    pub fn concat(&self, others: &[Lines]) -> Lines {
        let mut list = vec![self.clone()];
        list.extend_from_slice(others);
        concat(&list)
    }

    pub fn trim_left(&self) -> Lines {
        match self.skip_spaces(Some(self.first_pos()), false) {
            Some(p) => self.slice_from(p),
            None => Lines::empty(),
        }
    }

    pub fn first_char(&self) -> Option<u16> {
        self.char_at(self.first_pos())
    }

    pub fn last_char(&self) -> Option<u16> {
        let mut p = self.last_pos();
        if self.prev_pos(&mut p, false) {
            self.char_at(p)
        } else {
            None
        }
    }

    pub fn last_non_space_char(&self) -> Option<u16> {
        let mut pos = self.last_pos();
        loop {
            if let Some(ch) = self.char_at(pos) {
                if !is_ws_unit(ch) {
                    return Some(ch);
                }
            }
            if !self.prev_pos(&mut pos, false) {
                return None;
            }
        }
    }
}

fn count_spaces_undefined(spaces: &[u16]) -> i64 {
    // countSpaces(spaces, undefined): a tab makes the count NaN in JS. NaN
    // then behaves as an indent that `Math.max(NaN, 0)` turns into NaN; in
    // practice recast only calls fromString without options on printed
    // fragments, which never start with tabs. Treat a tab as width 0.
    let mut count = 0;
    for &c in spaces {
        match c {
            9 | 11 | 12 | 13 | 0xfeff => {}
            _ => count += 1,
        }
    }
    count
}

pub fn js_trim(s: &str) -> &str {
    s.trim_matches(|c: char| {
        let mut b = [0u16; 2];
        let enc = c.encode_utf16(&mut b);
        enc.len() == 1 && is_ws_unit(enc[0])
    })
}

pub fn slice_info(info: &Info, start_col: usize, end_col: Option<usize>) -> Info {
    let mut slice_start = info.slice_start as i64;
    let mut slice_end = info.slice_end as i64;
    let mut indent = info.indent.max(0);
    let line_length = indent + slice_end - slice_start;
    let mut end_col = end_col.map(|e| e as i64).unwrap_or(line_length);
    let mut start_col = (start_col as i64).max(0);
    end_col = end_col.min(line_length);
    end_col = end_col.max(start_col);
    if end_col < indent {
        indent = end_col;
        slice_end = slice_start;
    } else {
        slice_end -= line_length - end_col;
    }
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

pub fn concat(elements: &[Lines]) -> Lines {
    Lines::empty().join(elements)
}

#[derive(Clone, Debug)]
pub struct PrintOpts {
    pub tab_width: usize,
    pub use_tabs: bool,
    pub reuse_whitespace: bool,
    pub line_terminator: String,
}

impl Default for PrintOpts {
    fn default() -> Self {
        PrintOpts { tab_width: 4, use_tabs: false, reuse_whitespace: true, line_terminator: "\n".into() }
    }
}

/// Anything that can become Lines in a `concat([...])` call.
pub enum Part {
    S(String),
    L(Lines),
}

impl From<&str> for Part {
    fn from(s: &str) -> Part {
        Part::S(s.to_string())
    }
}
impl From<String> for Part {
    fn from(s: String) -> Part {
        Part::S(s)
    }
}
impl From<Lines> for Part {
    fn from(l: Lines) -> Part {
        Part::L(l)
    }
}
impl From<&Lines> for Part {
    fn from(l: &Lines) -> Part {
        Part::L(l.clone())
    }
}

impl Part {
    pub fn into_lines(self) -> Lines {
        match self {
            Part::S(s) => Lines::from_str(&s),
            Part::L(l) => l,
        }
    }
}

pub fn cat(parts: Vec<Part>) -> Lines {
    let v: Vec<Lines> = parts.into_iter().map(|p| p.into_lines()).collect();
    concat(&v)
}

#[macro_export]
macro_rules! lcat {
    ($($e:expr),* $(,)?) => {
        $crate::commands::upgrade::recast::lines::cat(vec![$($crate::commands::upgrade::recast::lines::Part::from($e)),*])
    };
}
