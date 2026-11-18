---
'@astryxdesign/cli': patch
---

[fix] `astryx component <name>` keeps a suggested component whose keywords or synonyms are the typed name ahead of another command's hint for a near spelling, and leaves the hint out when such components fill the list (`astryx component Combobox` lists Typeahead, Selector and Tokenizer, not `astryx hook useCombobox`).

@josephfarina
