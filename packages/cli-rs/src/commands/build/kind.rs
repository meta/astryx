//! Whether a build idea asks for a page, a part of a page, or a change to a
//! page the builder already has (`api/build/kit/kind.mjs`).

use super::js::{self, re};
use super::vocab::stem;
use super::words::{
    container_phrase, containers_of, family_words_of, head_end, phrase_end, terms, ComponentWords, IdeaKind,
    PageTemplate,
};
use indexmap::{IndexMap, IndexSet};

const PAGE_PIECES: usize = 3;

pub fn idea_kind(query: &str, pages: &[PageTemplate], components: &[ComponentWords]) -> IdeaKind {
    let text = query;
    let family_words = family_words_of(pages);
    if changes_existing_page(text, &family_words, components) {
        return IdeaKind::Edit;
    }
    let head0 = js::split_first(text, head_end());
    let head = container_phrase().replace_all_with(&head0, |m| {
        let s = &head0[m.range()];
        if !containers_of(s).is_empty() {
            " ".to_string()
        } else {
            s.to_string()
        }
    });
    let words: Vec<String> = js::alnum_runs(&js::lower(&head)).into_iter().filter(|w| w.len() >= 2).collect();
    let noun = stem(words.last().map(|s| s.as_str()).unwrap_or(""));
    if family_words.contains_key(&noun) {
        return IdeaKind::Page;
    }
    let pieces = text.matches(',').count() + 1;
    if pieces >= PAGE_PIECES {
        return IdeaKind::Page;
    }
    if components.iter().any(|c| component_terms(c).contains(&noun)) {
        IdeaKind::Part
    } else {
        IdeaKind::Page
    }
}

fn changes_existing_page(text: &str, family_words: &IndexMap<String, String>, components: &[ComponentWords]) -> bool {
    let component_words: IndexSet<String> = components.iter().flat_map(name_terms).collect();
    let phrases = js::split(&js::lower(text), phrase_end());
    if asks_new_page(&phrases, family_words) {
        return false;
    }
    let existing = re(r"\bexisting\b", "i");
    phrases.iter().any(|phrase| match js::search(phrase, existing) {
        Some(at) => terms(&phrase[at..]).iter().any(|t| family_words.contains_key(t) || component_words.contains(t)),
        None => false,
    })
}

fn asks_new_page(phrases: &[String], family_words: &IndexMap<String, String>) -> bool {
    let new = re(r"\bnew\b", "");
    phrases.iter().any(|phrase| match js::search(phrase, new) {
        None => false,
        Some(at) => {
            let after = terms(&phrase[at + 3..]);
            after.is_empty() || family_words.contains_key(&after[0])
        }
    })
}

pub fn asks_for_new_page(query: &str, pages: &[PageTemplate]) -> bool {
    asks_new_page(&js::split(&js::lower(query), phrase_end()), &family_words_of(pages))
}

/// "DateRangeInput" is date, range, input.
fn name_terms(component: &ComponentWords) -> Vec<String> {
    let spaced = re(r"([a-z0-9])([A-Z])", "").replace_all(&component.name, "$1 $2");
    terms(&spaced)
}

fn component_terms(component: &ComponentWords) -> Vec<String> {
    let mut v = name_terms(component);
    for k in &component.keywords {
        v.extend(terms(k));
    }
    v
}
