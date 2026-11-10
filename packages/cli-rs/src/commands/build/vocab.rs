//! Search's word vocabulary, as build reads it (`api/search` stem,
//! STOPWORDS, SYNONYMS).

use std::collections::HashSet;
use std::sync::OnceLock;

pub use crate::commands::search::{stem, SYNONYMS};

pub fn stopword_list() -> &'static [&'static str] {
    crate::commands::search::STOPWORDS
}

pub fn stopwords() -> &'static HashSet<&'static str> {
    static S: OnceLock<HashSet<&'static str>> = OnceLock::new();
    S.get_or_init(|| stopword_list().iter().copied().collect())
}
