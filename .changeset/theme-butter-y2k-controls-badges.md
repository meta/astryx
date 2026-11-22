---
'@astryxdesign/theme-butter': patch
'@astryxdesign/cli': patch
---

[fix] Butter's selector, multi-selector, typeahead and tokenizer keep Core's top and bottom padding, so a small select is 32px tall beside a 32px button and field instead of 38px. The CLI's bundled copy of Butter, which `astryx theme eject` hands out, changes the same way. To keep the taller fields, extend the theme with `components: {selector: {base: {paddingBlock: 'var(--spacing-2)'}}}` (and the same for `multi-selector`, `typeahead` and `tokenizer`).

@josephfarina
