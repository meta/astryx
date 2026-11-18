---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a `var()` is read as CSS reads it. Glued after a letter or a digit (`padding '2var(--spacing-4)'`), CSS reads no reference there, so the value is refused instead of written as a value the browser drops. Text glued after it (`'var(--spacing-4)px'`, `'8pxvar(--spacing-4)'`) is refused for the value's grammar, not as the token being the wrong kind, and the refusal no longer offers the same input again.

@josephfarina
