//! TEMP: replace with the component lane's `src/text/` port of
//! foundation/text/suggest-order.mjs. Only the path `docs` uses:
//! `orderRouteSuggestions` without typos.

fn singular(word: String) -> String {
    if word.len() > 3 && word.ends_with('s') && !word.ends_with("ss") {
        word[..word.len() - 1].to_string()
    } else {
        word
    }
}

/// `nameWords(text)`.
pub fn name_words(text: &str) -> Vec<String> {
    let mut words = Vec::new();
    for part in text.split(|c: char| !c.is_ascii_alphanumeric()) {
        if part.is_empty() {
            continue;
        }
        let b: Vec<char> = part.chars().collect();
        let mut i = 0;
        while i < b.len() {
            let c = b[i];
            let start = i;
            if c.is_ascii_digit() {
                while i < b.len() && b[i].is_ascii_digit() {
                    i += 1;
                }
            } else if c.is_ascii_uppercase() {
                // [A-Z]+(?=[A-Z][a-z]) | [A-Z]?[a-z]+ | [A-Z]+
                let mut j = i;
                while j < b.len() && b[j].is_ascii_uppercase() {
                    j += 1;
                }
                let run = j - i;
                if run >= 2 && j < b.len() && b[j].is_ascii_lowercase() {
                    // Uppercase run followed by lowercase: the run minus its
                    // last letter is one word (first alternative).
                    i = j - 1;
                } else if run == 1 && j < b.len() && b[j].is_ascii_lowercase() {
                    let mut k = j;
                    while k < b.len() && b[k].is_ascii_lowercase() {
                        k += 1;
                    }
                    i = k;
                } else {
                    i = j;
                }
            } else {
                while i < b.len() && b[i].is_ascii_lowercase() {
                    i += 1;
                }
            }
            if i == start {
                i += 1;
                continue;
            }
            let w: String = b[start..i].iter().collect();
            words.push(singular(w.to_lowercase()));
        }
    }
    words
}

fn affinity(typed: &[String], name: &str) -> f64 {
    let words = name_words(name);
    if typed.is_empty() || words.is_empty() {
        return 0.0;
    }
    let typed_joined = typed.concat();
    let joined = words.concat();
    if joined == typed_joined {
        return 40.0;
    }
    let covered = typed.iter().filter(|w| words.contains(w)).count() as f64 / typed.len() as f64;
    let precise = words.iter().filter(|w| typed.contains(w)).count() as f64 / words.len() as f64;
    let prefix = if joined.starts_with(&typed_joined) || typed_joined.starts_with(&joined) { 1.0 } else { 0.0 };
    let tier = if covered == 1.0 {
        2.0
    } else if covered > 0.0 {
        1.0
    } else {
        0.0
    };
    f64::max(0.0, tier * 10.0 + covered * 4.0 + precise * 2.0 + prefix + precise * 0.01)
}

fn order_by_words<T: Clone>(typed_name: &str, items: &[T], name_of: &dyn Fn(&T) -> String, closest: bool) -> Vec<T> {
    let typed = name_words(typed_name);
    let mut scored: Vec<(usize, f64)> = items.iter().enumerate().map(|(i, it)| (i, affinity(&typed, &name_of(it)))).collect();
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal).then(a.0.cmp(&b.0)));
    if !closest {
        return scored.iter().map(|(i, _)| items[*i].clone()).collect();
    }
    let words: Vec<String> = typed.into_iter().filter(|w| w.chars().count() > 1).collect();
    let tiers: Vec<u64> = scored.iter().map(|(i, _)| (affinity(&words, &name_of(&items[*i])) / 10.0).floor() as u64).collect();
    let top = tiers.iter().copied().max().unwrap_or(0);
    if top == 0 {
        return scored.iter().map(|(i, _)| items[*i].clone()).collect();
    }
    let need = top.min(2);
    scored.iter().zip(tiers).filter(|(_, t)| *t >= need).map(|((i, _), _)| items[*i].clone()).collect()
}

/// `orderRouteSuggestions(topic, suggestions, {closest})`.
pub fn order_route_suggestions(topic: &str, suggestions: Vec<(String, String)>, closest: bool) -> Vec<(String, String)> {
    let mut shared: String = suggestions.first().map(|s| s.0.clone()).unwrap_or_default();
    for (name, _) in &suggestions {
        while !shared.is_empty() && !name.starts_with(&shared) {
            shared.pop();
        }
    }
    let namespace = match shared.rfind('/') {
        Some(i) => shared[..=i].to_string(),
        None => String::new(),
    };
    if !namespace.is_empty() && topic.starts_with(&namespace) {
        let n = namespace.len();
        order_by_words(&topic[n..], &suggestions, &|s: &(String, String)| s.0[n..].to_string(), closest)
    } else {
        order_by_words(topic, &suggestions, &|s: &(String, String)| s.0.clone(), closest)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn words() {
        assert_eq!(name_words("HTMLElement"), vec!["html", "element"]);
        assert_eq!(name_words("use-a-theme"), vec!["use", "a", "theme"]);
        assert_eq!(name_words("tokens2Colors"), vec!["token", "2", "color"]);
    }
}
