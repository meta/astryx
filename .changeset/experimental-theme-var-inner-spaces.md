---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a `var()` with spaces inside its brackets (`background-color 'var( --color-accent )'`) is read as CSS reads it, the same as `var(--color-accent)`. Before, every color refused it as no color.

@josephfarina
