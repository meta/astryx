---
'@astryxdesign/cli': patch
---

[feat] `astryx theme list` names, for each theme, the owner the app imports it from and whether that owner is installed (`owner`, `installed`). The CLI ships a bundled theme's descriptor and source (for `theme eject`), not the built output the app imports: `theme add` records and the app imports that from the theme's own package (such as `@astryxdesign/theme-neutral`), and refuses to add it until that package is installed; the list now says so instead of naming only the CLI. Existing fields are unchanged.

@josephfarina
