---
'@astryxdesign/core': patch
---

[fix] The active option of a select, multi-select and typeahead list (the one the keyboard or pointer is on, named by `aria-activedescendant`) carries a `highlighted` theme state on its row target, as Item and CommandPaletteItem rows do: `selector-option-row`, `multi-selector-option`, and the typeahead's option row, which gets its own target, `typeahead-option` (with `size` and `selected`). A theme can style the highlighted option without a structural selector.

@josephfarina
