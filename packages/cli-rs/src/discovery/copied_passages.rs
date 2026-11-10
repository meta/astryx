//! Port of `foundation/discovery/copied-passages.mjs`: passages a package's
//! doc topics copy word for word from each other or from Core's guides.
//! Offsets (`at`, span `start`/`end`) are UTF-16 indexes, as in the JS.

use super::docs_discovery::{builtin_guide_files, load_topic_module, IntegrationDocs};
use super::nodepath as np;
use crate::json::Value;
use std::collections::HashMap;
use std::sync::OnceLock;

pub const PASSAGE_WORDS: usize = 10;
pub const MIN_CONTENT_WORDS: usize = 4;
pub const BOILERPLATE_TOPICS: usize = 3;

const FUNCTION_WORDS_TEXT: &str = "a about above after again all also an and any are as at be because been before being below between both but by can could did do does doing down during each either else every few for from further had has have having he her here him his how i if in into is it its itself just may me might more most must my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up us very was we were what when where which while who whom why will with would you your";

fn function_words() -> &'static Vec<&'static str> {
    static F: OnceLock<Vec<&'static str>> = OnceLock::new();
    F.get_or_init(|| FUNCTION_WORDS_TEXT.split(' ').collect())
}

/// Whether a word is a function word.
pub fn is_function_word(w: &str) -> bool {
    function_words().contains(&w)
}

/// A word with its section and string (`proseWords` entry).
#[derive(Debug, Clone, PartialEq)]
pub struct ProseWord {
    pub word: String,
    pub section: Option<String>,
    pub block: usize,
}

fn trim_bare(word: &str) -> &str {
    let lead = word.find(|c: char| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '@').unwrap_or(word.len());
    let s = &word[lead..];
    let end = s.rfind(|c: char| c.is_ascii_lowercase() || c.is_ascii_digit()).map(|i| i + 1).unwrap_or(0);
    &s[..end]
}

/// `contentWords(words, start, length)` over plain words.
pub fn content_words_of(words: &[&str]) -> usize {
    let mut found: Vec<&str> = Vec::new();
    for w in words {
        let bare = trim_bare(w);
        if !bare.is_empty() && !is_function_word(bare) && !found.contains(&bare) {
            found.push(bare);
        }
    }
    found.len()
}

/// `contentWords(words, start, length)`.
pub fn content_words(words: &[ProseWord], start: usize, length: usize) -> usize {
    let end = (start + length).min(words.len());
    let slice: Vec<&str> = words.get(start..end).unwrap_or(&[]).iter().map(|w| w.word.as_str()).collect();
    content_words_of(&slice)
}

const SKIP_KEYS: [&str; 21] = [
    "aliases", "audience", "category", "code", "example", "examples", "extends", "id", "import", "keywords", "label", "lang", "name", "placement",
    "projection", "props", "relationships", "replaces", "source", "title", "type",
];
const SKIP_BLOCKS: [&str; 3] = ["code", "example", "reference"];
const POINTERS: &str = r"\{@link [^}]*\}|`astryx docs [^`]*`";

fn replace_all(s: &str, re: &str, f: &dyn Fn(&str) -> String) -> String {
    super::file_protection::js_replace(s, re, "", true, &|g, _, _| f(g[0].as_deref().unwrap_or("")))
}

/// `passageWords(text)`.
pub fn passage_words(text: &str) -> Vec<String> {
    let t = replace_all(&text.to_lowercase(), POINTERS, &|_| " ".into());
    let t: String = t.chars().filter(|c| *c != '`' && *c != '*').collect();
    t.split(|c: char| !(c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '\'' | '@' | '.' | '/' | '-')))
        .filter(|w| w.chars().any(|c| c.is_ascii_lowercase() || c.is_ascii_digit()))
        .map(String::from)
        .collect()
}

/// A word of a file, with its 1-based line (`fileWords` entry).
#[derive(Debug, Clone)]
pub struct FileWord {
    pub word: String,
    pub line: usize,
}

fn alnum_runs(s: &str) -> Vec<(usize, &str)> {
    // (UTF-16 index, run) of each [A-Za-z0-9]+ run.
    let mut out = Vec::new();
    let mut u16i = 0usize;
    let mut start: Option<(usize, usize)> = None;
    for (bi, c) in s.char_indices() {
        let is = c.is_ascii_alphanumeric();
        match (is, start) {
            (true, None) => start = Some((bi, u16i)),
            (false, Some((sb, su))) => {
                out.push((su, &s[sb..bi]));
                start = None;
            }
            _ => {}
        }
        u16i += c.len_utf16();
    }
    if let Some((sb, su)) = start {
        out.push((su, &s[sb..]));
    }
    out
}

/// `fileWords(source)`.
pub fn file_words(source: &str) -> Vec<FileWord> {
    let mut out = Vec::new();
    for (at, line) in source.split('\n').enumerate() {
        for (_, w) in alnum_runs(line) {
            out.push(FileWord { word: w.to_lowercase(), line: at + 1 });
        }
    }
    out
}

/// A word of a string with its UTF-16 index (`textWords` entry).
#[derive(Debug, Clone)]
pub struct TextWord {
    pub word: String,
    pub at: usize,
}

/// `textWords(text)`.
pub fn text_words(text: &str) -> Vec<TextWord> {
    alnum_runs(text).into_iter().map(|(at, w)| TextWord { word: w.to_lowercase(), at }).collect()
}

/// `locateWords(file, words, from)`: index or -1.
pub fn locate_words(file: &[FileWord], words: &[TextWord], from: usize) -> i64 {
    if words.is_empty() {
        return -1;
    }
    let mut i = from;
    'outer: while i + words.len() <= file.len() {
        for k in 0..words.len() {
            if file[i + k].word != words[k].word {
                i += 1;
                continue 'outer;
            }
        }
        return i as i64;
    }
    -1
}

/// `lineAtOffset(file, index, words, at)`.
pub fn line_at_offset(file: &[FileWord], index: usize, words: &[TextWord], at: usize) -> Option<usize> {
    let k = words.iter().position(|w| w.at + 1 > at).unwrap_or(words.len().saturating_sub(1));
    file.get(index + k).map(|w| w.line)
}

/// `trimBoilerplate({start, length}, boilerplate)`.
pub fn trim_boilerplate(start: usize, length: usize, boilerplate: &dyn Fn(usize) -> bool) -> Option<(usize, usize)> {
    let last_window = start as i64 + length as i64 - PASSAGE_WORDS as i64;
    let mut lead = start as i64;
    while lead <= last_window && boilerplate(lead as usize) {
        lead += 1;
    }
    let begin = if lead > start as i64 { lead - 1 + PASSAGE_WORDS as i64 } else { start as i64 };
    let mut tail = last_window;
    while tail >= begin && tail >= 0 && boilerplate(tail as usize) {
        tail -= 1;
    }
    let end = if tail < last_window { tail + 1 } else { (start + length) as i64 };
    if end - begin < PASSAGE_WORDS as i64 {
        None
    } else {
        Some((begin as usize, (end - begin) as usize))
    }
}

/// A word span (`wordSpans` entry), UTF-16 indexes.
#[derive(Debug, Clone)]
pub struct WordSpan {
    pub word: String,
    pub start: usize,
    pub end: usize,
}

/// `wordSpans(text)`.
pub fn word_spans(text: &str) -> Vec<WordSpan> {
    let lower = text.to_lowercase();
    let masked = replace_all(&lower, POINTERS, &|p| " ".repeat(p.encode_utf16().count()));
    let mut spans = Vec::new();
    let mut u16i = 0usize;
    let mut cur: Option<(usize, String)> = None;
    let in_word = |c: char| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '\'' | '@' | '.' | '/' | '`' | '*' | '-');
    let mut flush = |cur: &mut Option<(usize, String)>, end: usize, spans: &mut Vec<WordSpan>| {
        if let Some((start, raw)) = cur.take() {
            let word: String = raw.chars().filter(|c| *c != '`' && *c != '*').collect();
            if word.chars().any(|c| c.is_ascii_lowercase() || c.is_ascii_digit()) {
                spans.push(WordSpan { word, start, end });
            }
        }
    };
    for c in masked.chars() {
        if in_word(c) {
            match &mut cur {
                Some((_, raw)) => raw.push(c),
                None => cur = Some((u16i, c.to_string())),
            }
        } else {
            flush(&mut cur, u16i, &mut spans);
        }
        u16i += c.len_utf16();
    }
    flush(&mut cur, u16i, &mut spans);
    spans
}

/// A prose string with its section (`proseStrings` entry).
#[derive(Debug, Clone)]
pub struct ProseString {
    pub text: String,
    pub section: Option<String>,
}

/// `proseStrings(doc)`.
pub fn prose_strings(doc: &Value) -> Vec<ProseString> {
    let mut out = Vec::new();
    fn walk(v: &Value, section: &Option<String>, out: &mut Vec<ProseString>) {
        match v {
            Value::String(s) => out.push(ProseString { text: s.clone(), section: section.clone() }),
            Value::Array(a) => a.iter().for_each(|x| walk(x, section, out)),
            Value::Object(m) => {
                if m.contains_key("__js") {
                    return;
                }
                if let Some(Value::String(t)) = m.get("type") {
                    if SKIP_BLOCKS.contains(&t.as_str()) {
                        return;
                    }
                }
                if let Some(Value::Array(secs)) = m.get("sections") {
                    for (k, f) in m {
                        if k != "sections" && !SKIP_KEYS.contains(&k.as_str()) {
                            walk(f, section, out);
                        }
                    }
                    for each in secs {
                        let title = each.get("title").and_then(|t| t.as_str()).map(String::from).or_else(|| section.clone());
                        walk(each, &title, out);
                    }
                    return;
                }
                for (k, f) in m {
                    if !SKIP_KEYS.contains(&k.as_str()) {
                        walk(f, section, out);
                    }
                }
            }
            _ => {}
        }
    }
    walk(doc, &None, &mut out);
    out
}

/// `proseWords(doc)`.
pub fn prose_words(doc: &Value) -> Vec<ProseWord> {
    let mut out = Vec::new();
    for (at, ps) in prose_strings(doc).into_iter().enumerate() {
        for w in passage_words(&ps.text) {
            out.push(ProseWord { word: w, section: ps.section.clone(), block: at + 1 });
        }
    }
    out
}

fn in_one_string(words: &[ProseWord], at: usize, size: usize) -> bool {
    words[at].block == words[at + size - 1].block
}

fn key_of(words: &[ProseWord], start: usize, len: usize) -> String {
    words[start..start + len].iter().map(|w| w.word.as_str()).collect::<Vec<_>>().join(" ")
}

/// `sharedPassages(mine, other, size)`: runs sorted longest first.
pub fn shared_passages(mine: &[ProseWord], other: &[ProseWord], size: usize) -> Vec<(usize, usize)> {
    if mine.len() < size || other.len() < size {
        return vec![];
    }
    let mut starts: HashMap<String, Vec<usize>> = HashMap::new();
    for i in 0..=other.len() - size {
        if !in_one_string(other, i, size) {
            continue;
        }
        starts.entry(key_of(other, i, size)).or_default().push(i);
    }
    let mut runs = Vec::new();
    let mut i = 0;
    while i + size <= mine.len() {
        let found = if in_one_string(mine, i, size) { starts.get(&key_of(mine, i, size)) } else { None };
        let Some(found) = found else {
            i += 1;
            continue;
        };
        let mut best = size;
        for &j in found {
            let mut length = size;
            while i + length < mine.len()
                && j + length < other.len()
                && mine[i + length].block == mine[i].block
                && other[j + length].block == other[j].block
                && mine[i + length].word == other[j + length].word
            {
                length += 1;
            }
            best = best.max(length);
        }
        runs.push((i, best));
        i += best;
    }
    // Array#sort is stable: equal lengths keep their order.
    runs.sort_by(|a, b| b.1.cmp(&a.1));
    runs
}

fn windows(words: &[ProseWord]) -> Vec<String> {
    let mut keys: Vec<String> = Vec::new();
    if words.len() < PASSAGE_WORDS {
        return keys;
    }
    let mut seen = std::collections::HashSet::new();
    for i in 0..=words.len() - PASSAGE_WORDS {
        if !in_one_string(words, i, PASSAGE_WORDS) {
            continue;
        }
        let k = key_of(words, i, PASSAGE_WORDS);
        if seen.insert(k.clone()) {
            keys.push(k);
        }
    }
    keys
}

/// A guide or topic indexed by its windows.
#[derive(Debug, Clone)]
pub struct Guide {
    pub name: String,
    pub words: Vec<ProseWord>,
}

/// Guides indexed by window.
pub struct Indexed {
    pub guides: Vec<Guide>,
    pub index: HashMap<String, Vec<usize>>,
}

fn index_guides(guides: Vec<Guide>) -> Indexed {
    let mut index: HashMap<String, Vec<usize>> = HashMap::new();
    for (at, g) in guides.iter().enumerate() {
        for k in windows(&g.words) {
            index.entry(k).or_default().push(at);
        }
    }
    Indexed { guides, index }
}

fn candidates(words: &[ProseWord], indexed: &Indexed) -> Vec<usize> {
    let mut found: Vec<usize> = Vec::new();
    for k in windows(words) {
        for at in indexed.index.get(&k).map(|v| v.as_slice()).unwrap_or(&[]) {
            if !found.contains(at) {
                found.push(*at);
            }
        }
    }
    found.sort();
    found
}

/// `loadQuietly(file)`.
pub fn load_quietly(file: &str) -> Option<Value> {
    load_topic_module(file).ok()
}

/// `loadCoreGuides()`.
pub fn load_core_guides() -> &'static Indexed {
    static C: OnceLock<Indexed> = OnceLock::new();
    C.get_or_init(|| {
        let mut guides = Vec::new();
        for f in builtin_guide_files() {
            if let Some(doc) = load_quietly(&f) {
                if let Some(Value::String(n)) = doc.get("name") {
                    guides.push(Guide { name: n.clone(), words: prose_words(&doc) });
                }
            }
        }
        index_guides(guides)
    })
}

struct Topic {
    name: String,
    file: Option<String>,
    replaces: Option<String>,
    extends_topic: Option<String>,
    title: String,
    doc: Option<Value>,
    words: Vec<ProseWord>,
}

fn utf16_slice(s: &str, from: usize, to: usize) -> String {
    let u: Vec<u16> = s.encode_utf16().collect();
    String::from_utf16_lossy(&u[from.min(u.len())..to.min(u.len())])
}

fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// One copied-passage finding.
#[derive(Debug, Clone, PartialEq)]
pub struct CopiedPassage {
    pub topic: String,
    pub section: Option<String>,
    pub line: Option<usize>,
    pub other_topic: String,
    pub other_owner: &'static str,
    pub owner: String,
    pub text: String,
    pub words: usize,
    pub passages: usize,
    pub message: String,
}

impl CopiedPassage {
    pub fn to_json(&self) -> Value {
        serde_json::json!({
            "topic": self.topic, "section": self.section, "line": self.line, "otherTopic": self.other_topic,
            "otherOwner": self.other_owner, "owner": self.owner, "text": self.text, "words": self.words,
            "passages": self.passages, "message": self.message,
        })
    }
}

/// `findCopiedPassages(discovered)`.
pub fn find_copied_passages(discovered: &IntegrationDocs) -> Vec<CopiedPassage> {
    let mut raw: Vec<(String, Option<String>, Option<String>, Option<String>)> =
        discovered.records.iter().map(|r| (r.name.clone(), Some(r.path.clone()), r.replaces.clone(), r.extends_topic.clone())).collect();
    for g in &discovered.guides {
        raw.push((
            super::paths::js_string(g.get("name")),
            g.get("ref").and_then(|r| r.get("topicFile")).and_then(|f| f.as_str()).map(String::from),
            None,
            None,
        ));
    }
    let mut mine: Vec<Topic> = Vec::new();
    for (name, file, replaces, extends_topic) in raw {
        let Some(doc) = file.as_deref().and_then(load_quietly) else { continue };
        let title = doc.get("title").and_then(|t| t.as_str()).map(String::from).unwrap_or_else(|| name.clone());
        let words = prose_words(&doc);
        mine.push(Topic { name, file, replaces, extends_topic, title, doc: Some(doc), words });
    }
    if mine.is_empty() {
        return vec![];
    }
    let core = load_core_guides();
    let core_names: Vec<String> = core.guides.iter().map(|g| g.name.to_lowercase()).collect();
    let package_names: Vec<String> = mine.iter().map(|t| t.name.to_lowercase()).collect();
    let own = index_guides(mine.iter().map(|t| Guide { name: t.name.clone(), words: t.words.clone() }).collect());
    let topics_sharing = |words: &[ProseWord], start: usize| -> usize {
        let end = (start + PASSAGE_WORDS).min(words.len());
        let key = words[start..end].iter().map(|w| w.word.as_str()).collect::<Vec<_>>().join(" ");
        let a: std::collections::HashSet<usize> = own.index.get(&key).cloned().unwrap_or_default().into_iter().collect();
        let b: std::collections::HashSet<usize> = core.index.get(&key).cloned().unwrap_or_default().into_iter().collect();
        a.len() + b.len()
    };
    let filtered = |a: &[ProseWord], b: &[ProseWord]| -> Vec<(usize, usize)> {
        shared_passages(a, b, PASSAGE_WORDS)
            .into_iter()
            .filter_map(|(start, length)| {
                let run = trim_boilerplate(start, length, &|at| topics_sharing(a, at) >= BOILERPLATE_TOPICS)?;
                if content_words(a, run.0, run.1) >= MIN_CONTENT_WORDS {
                    Some(run)
                } else {
                    None
                }
            })
            .collect()
    };
    let stem = |w: &str| if utf16_len(w) > 3 && w.ends_with('s') { w[..w.len() - 1].to_string() } else { w.to_string() };
    let fit = |name: &str, title: &str, words: &[String], section: &Option<String>| -> usize {
        let label_src = format!("{} {} {}", name.replace('-', " "), title, section.clone().unwrap_or_default());
        let label: Vec<String> = passage_words(&label_src).into_iter().filter(|w| !is_function_word(w)).map(|w| stem(&w)).collect();
        let mut set: Vec<String> = Vec::new();
        for w in words {
            let s = stem(w);
            if label.contains(&s) && !set.contains(&s) {
                set.push(s);
            }
        }
        set.len()
    };
    let first_in_block = |words: &[ProseWord], start: usize| {
        let mut first = start;
        while first > 0 && words[first - 1].block == words[start].block {
            first -= 1;
        }
        first
    };
    let line_of = |t: &Topic, start: usize| -> Option<usize> {
        let doc = t.doc.as_ref()?;
        let file = t.file.as_ref()?;
        let text = prose_strings(doc).get(t.words[start].block - 1)?.text.clone();
        if text.is_empty() {
            return None;
        }
        let source = np::read_text(file)?;
        let fw = file_words(&source);
        let words = text_words(&text);
        let index = locate_words(&fw, &words, 0);
        if index < 0 {
            return None;
        }
        let first = first_in_block(&t.words, start);
        let span = word_spans(&text).get(start - first).cloned()?;
        line_at_offset(&fw, index as usize, &words, span.start)
    };
    let written_text = |t: &Topic, start: usize, length: usize| -> Option<String> {
        let doc = t.doc.as_ref()?;
        let text = prose_strings(doc).get(t.words[start].block - 1)?.text.clone();
        if text.is_empty() {
            return None;
        }
        let first = first_in_block(&t.words, start);
        let spans = word_spans(&text);
        let from = spans.get(start - first)?;
        let to = spans.get(start - first + length - 1)?;
        Some(utf16_slice(&text, from.start, to.end))
    };
    let page_of = |extends: &Option<String>, name: &str| extends.clone().unwrap_or_else(|| name.to_string()).to_lowercase();
    let mut found = Vec::new();
    // compare(first, second, kind): `second_core` names a Core guide.
    let mut compare = |ti: usize, other: Result<usize, usize>, found: &mut Vec<CopiedPassage>| {
        let first = &mine[ti];
        let (o_name, o_title, o_words, o_extends): (String, String, Vec<ProseWord>, Option<String>) = match other {
            Ok(j) => (mine[j].name.clone(), mine[j].title.clone(), mine[j].words.clone(), mine[j].extends_topic.clone()),
            Err(c) => (core.guides[c].name.clone(), String::new(), core.guides[c].words.clone(), None),
        };
        let kind = if other.is_ok() { "package" } else { "core" };
        let mut runs = filtered(&first.words, &o_words);
        if runs.is_empty() {
            return;
        }
        // topic / owner as (index into mine or core marker).
        let mut topic_is_first = true;
        let mut why = "Core keeps the text it shares".to_string();
        let mut owner_name = o_name.clone();
        let mut owner_extends = o_extends.clone();
        if let Ok(j) = other {
            let words: Vec<String> = first.words[runs[0].0..runs[0].0 + runs[0].1].iter().map(|w| w.word.clone()).collect();
            let other_runs = filtered(&mine[j].words, &first.words);
            let first_fit = fit(&first.name, &first.title, &words, &first.words[runs[0].0].section);
            let second_fit = if other_runs.is_empty() { 0 } else { fit(&o_name, &o_title, &words, &mine[j].words[other_runs[0].0].section) };
            let first_keeps = first_fit > second_fit
                || (first_fit == second_fit && super::jsort::locale_compare(&first.name, &o_name) == std::cmp::Ordering::Less);
            if first_keeps && !other_runs.is_empty() {
                topic_is_first = false;
                owner_name = first.name.clone();
                owner_extends = first.extends_topic.clone();
                runs = other_runs;
            }
            why = if first_fit == second_fit {
                format!("\"{owner_name}\" keeps it: neither topic's name, title or section fits it better, so the one whose name sorts first does")
            } else {
                format!("\"{owner_name}\" keeps it: its name, title or section fits the passage")
            };
        }
        let topic: &Topic = if topic_is_first { first } else { &mine[other.unwrap()] };
        let (start, length) = runs[0];
        let written = written_text(topic, start, length)
            .unwrap_or_else(|| topic.words[start..start + length].iter().map(|w| w.word.as_str()).collect::<Vec<_>>().join(" "));
        let excerpt = if utf16_len(&written) <= 240 {
            written.clone()
        } else {
            let n = utf16_len(&written);
            format!("{} … {}", utf16_slice(&written, 0, 120), utf16_slice(&written, n - 80, n))
        };
        let section = topic.words[start].section.clone();
        let line = line_of(topic, start);
        let mut wh: Vec<String> = Vec::new();
        if let Some(s) = &section {
            if !s.is_empty() {
                wh.push(format!("section \"{s}\""));
            }
        }
        if let Some(l) = line {
            wh.push(format!("line {l}"));
        }
        let where_ = wh.join(", ");
        let more = if runs.len() > 1 { format!(", and {} more passage(s)", runs.len() - 1) } else { String::new() };
        let named = if kind == "core" { format!("the Core topic \"{owner_name}\"") } else { format!("\"{owner_name}\"") };
        let page = page_of(&owner_extends, &owner_name);
        let core_page = kind == "core" || (owner_extends.is_some() && core_names.contains(&page) && !package_names.contains(&page));
        let link = if core_page { format!("{{@link @astryxdesign/cli:generic:{page}}}") } else { format!("{{@link generic:{page}}}") };
        let replacer = if kind == "core" { mine.iter().find(|m| m.replaces.as_ref().map(|r| r.to_lowercase()) == Some(page.clone())) } else { None };
        let fix = if let Some(r) = replacer {
            format!(
                "\"{}\" replaces the Core topic \"{owner_name}\", so a link to it opens \"{}\", which does not carry this text: reword the passage in \"{}\" in your own words, or move it into \"{}\".",
                r.name, r.name, topic.name, r.name
            )
        } else if page_of(&topic.extends_topic, &topic.name) == page {
            format!(
                "\"{}\" and \"{owner_name}\" show on the same page (\"{page}\"): delete the passage from \"{}\", or, if its section overrides one there, drop the override so the original shows.",
                topic.name, topic.name
            )
        } else {
            format!("In \"{}\", replace that whole passage, from its first word to its last, code ticks included, with {link}.", topic.name)
        };
        let paren = if where_.is_empty() { String::new() } else { format!(" ({where_})") };
        found.push(CopiedPassage {
            topic: topic.name.clone(),
            section,
            line,
            other_topic: owner_name.clone(),
            other_owner: kind,
            owner: owner_name.clone(),
            text: written,
            words: length,
            passages: runs.len(),
            message: format!("\"{}\"{paren} repeats {length} words of {named} word for word{more}: \"{excerpt}\". {why}. {fix}", topic.name),
        });
    };
    for i in 0..mine.len() {
        for at in candidates(&mine[i].words, &own) {
            if at > i {
                compare(i, Ok(at), &mut found);
            }
        }
        for at in candidates(&mine[i].words, core) {
            let other = &core.guides[at];
            if mine[i].replaces.as_ref().map(|r| r.to_lowercase()) != Some(other.name.to_lowercase()) {
                compare(i, Err(at), &mut found);
            }
        }
    }
    found
}
