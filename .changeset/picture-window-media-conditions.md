---
'@astryxdesign/cli': patch
---

[fix] The theme editor's pictures and the render stylesheet cut read a media query's condition the way the browser does: `not` before a condition in parentheses, `or`, and nesting. A rule under `(not ((min-width: 768px) and (min-height: 500px)))` no longer counts as matching in the 1280px picture window.

@josephfarina
