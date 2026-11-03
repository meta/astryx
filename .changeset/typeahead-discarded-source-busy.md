---
'@astryxdesign/core': patch
---

[fix] `Typeahead`, `Tokenizer`, `PowerSearch`: a search no longer stays busy forever when React renders a new search source and then discards that render, for example a transition that suspends and that a newer update replaces before it commits. The search of the source that stays now finishes: its results show, and the loading indicator and `aria-busy` clear.

@imdreamrunner
