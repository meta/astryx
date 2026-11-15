---
'@astryxdesign/cli': patch
---

[fix] `astryx component <name>` keeps a suggested component whose keywords or synonyms are the typed name ahead of another command's hint for a near spelling (`astryx component Combobox` lists Typeahead first, not `astryx hook useCombobox`).

@josephfarina
