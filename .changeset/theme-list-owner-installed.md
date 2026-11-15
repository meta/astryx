---
'@astryxdesign/cli': patch
---

[fix] `astryx theme list` names, for each theme, the owner the app imports it from and whether that owner is installed (`owner`, `installed`). A bundled theme's descriptor ships in the CLI, but `theme add` records and the app imports its built output from the theme's own package (such as `@astryxdesign/theme-neutral`), and refuses to add it until that package is installed; the list now says so instead of naming only the CLI. Existing fields are unchanged.

@josephfarina
