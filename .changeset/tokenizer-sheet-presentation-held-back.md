---
'@astryxdesign/core': patch
---

[chore] Internal: Tokenizer's touch sheet presentation is held back until its user experience is finished. The implementation stays in the package, reachable only through an internal entry reserved for Astryx's own packages; `TokenizerProps` offers no `experimental.presentation`, every Tokenizer renders the inline combobox, and nothing a consumer sees changes.

@imdreamrunner
