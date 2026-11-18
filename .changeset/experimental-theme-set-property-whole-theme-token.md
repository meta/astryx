---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set`: a CSS property set with no part (`set <theme> border-width 2px`) is still refused, but the refusal now offers the whole-theme token that gets the look (`--border-width 2px`, `font-weight 300` → `--text-body-weight 300`, `line-height 1.6` → `--text-body-leading 1.6`), instead of only a lookup.

@josephfarina
