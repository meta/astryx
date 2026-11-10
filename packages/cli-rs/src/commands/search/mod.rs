//! `astryx search`: one ranked search across components, hooks, docs,
//! templates and themes (`packages/cli/api/search`,
//! `clients/cli/commands/search.mjs`).

pub mod api;
pub mod cand;
pub mod command;
pub mod docs;
pub mod collate;
pub mod gather;
pub mod index;
pub mod learned;
pub mod lexical;
pub mod score;
pub mod words;

pub use words::{stem, STOPWORDS_LIST as STOPWORDS, SYNONYMS};

#[cfg(test)]
mod golden_test;

pub use api::{component_keywords, search_core, try_component_keywords};
pub use command::run;
