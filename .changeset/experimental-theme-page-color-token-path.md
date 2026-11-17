---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` and `set`: `how --color-background-body` now opens with where the page color shows. The first `set` of that token in a theme notes the same, and so does every page-color answer: the color shows inside `AppShell`; wrap the page in `AppShell`, or, if you can't, add `body { background: var(--color-background-body) }` to global CSS. For a theme with only one mode, the note adds that the page must use the theme's page color in every OS mode. The "Use a theme" guide uses the same wording.

@josephfarina
