---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` fails, naming it and its import error, when the project's installed `@astryxdesign/core` (or, outside a project, the Core the CLI release carries) does not load or lacks `defineTheme` or `generateThemeRulesSplit`, instead of building with the CLI's own Core. A project with no Core installed still builds with the CLI's.

@vjeux
