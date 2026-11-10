//! Section keys and lookup (foundation/discovery/docs-section-key.mjs).

use unicode_normalization::UnicodeNormalization;

/// One section as a reader finds it: its key, its shown title, and the title
/// it was authored with (an overlay can translate the shown one).
#[derive(Debug, Clone)]
pub struct ReaderSection {
    pub key: String,
    pub title: String,
    pub source_title: String,
}

/// `sectionTitleKey(title)`.
pub fn section_title_key(title: &str) -> String {
    let folded: String = title.nfkd().filter(|c| !('\u{300}'..='\u{36f}').contains(c)).collect();
    let lower = folded.to_lowercase().replace('&', " and ");
    let mut out = String::new();
    let mut gap = false;
    for c in lower.chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            if gap && !out.is_empty() {
                out.push('-');
            }
            gap = false;
            out.push(c);
        } else {
            gap = true;
        }
    }
    out
}

/// JS `toLowerCase` on a title (Unicode default lowering).
fn lower(s: &str) -> String {
    s.to_lowercase()
}

/// `findDocSection(sections, query)`: the index of the section a query names.
pub fn find_doc_section(sections: &[ReaderSection], query: &str) -> Option<usize> {
    let wanted = query.trim_matches(crate::cli::format::js_ws);
    let by_key = sections.iter().position(|s| s.key == wanted);
    let localized = sections.iter().any(|s| s.source_title != s.title);
    if by_key.is_some() && localized {
        return by_key;
    }
    let lw = lower(wanted);
    if let Some(i) = sections.iter().position(|s| lower(&s.title).contains(&lw)) {
        return Some(i);
    }
    if by_key.is_some() {
        return by_key;
    }
    let derived = section_title_key(wanted);
    if derived.is_empty() {
        return None;
    }
    sections.iter().position(|s| section_title_key(&s.source_title) == derived)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn title_keys() {
        assert_eq!(section_title_key("Light & Dark mode"), "light-and-dark-mode");
        assert_eq!(section_title_key("  Café — tips! "), "cafe-tips");
        assert_eq!(section_title_key("深色模式"), "");
    }
}
