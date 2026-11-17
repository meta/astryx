---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: a page-color answer now also lists the parts that draw the page color (the app shell and the main panel). It also says that the page color paints inside `AppShell`, and that a page without `AppShell` stays white until its own CSS adds `body { background: var(--color-background-body) }`. The "Use a theme" guide says the same.

@josephfarina
