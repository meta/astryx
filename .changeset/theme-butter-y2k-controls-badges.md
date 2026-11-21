---
'@astryxdesign/theme-butter': patch
'@astryxdesign/theme-y2k': patch
---

[fix] Butter's selector, multi-selector, typeahead and tokenizer keep Core's top and bottom padding, so a small select is 32px tall beside a 32px button and field instead of 38px. Butter's and Y2K's badges take the element corners (8px in Butter, square in Y2K), as their buttons and inputs do, instead of pill corners.

@josephfarina
