---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: tokens of the theme's own that read each other (`--a1: var(--a2)`, `--a2: var(--a1)`) are refused at their line, as a token that reads itself is. A token in `onDark` or `onLight` is judged against what that surface sets, so a surface token that reads a token the page sets from it is accepted.

@josephfarina
