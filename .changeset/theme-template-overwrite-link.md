---
'@astryxdesign/cli': patch
---

[fix] `astryx theme template --overwrite` no longer replaces a theme editor file reached under another spelling of its path: another letter case on a case-insensitive disk (`themes/t/T.theme.ts`) or a link to it is refused, as the file's own name is.

@josephfarina
