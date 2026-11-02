---
'@astryxdesign/core': patch
---

[fix] `Typeahead` and `Tokenizer`: after the search source is replaced, pressing ArrowDown on the closed field loads the new source (its focus entries, or the typed query against it) instead of opening the old source's list.

@cixzhang
