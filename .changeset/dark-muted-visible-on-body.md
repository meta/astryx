---
'@astryxdesign/core': patch
---

[fix] In dark mode, `--color-background-muted` is a light tint, matching light mode. A muted Card, Section, ProgressBar track, inline Code, or striped table row now shows on the page body as well as on a surface. Before, it painted the body color over the body and could not be seen.

@josephfarina
