---
'@astryxdesign/cli': patch
---

[fix] In a project that pins `@astryxdesign/core` to one version, as Astryx starters do, the commands the CLI prints to add or upgrade Astryx packages (the once-a-day hint, `doctor`'s fixes, the setup reminder, and the upgrade notice) save the new versions exactly too, such as `npm install -E @astryxdesign/cli@0.7.16`. Before, with npm, following them replaced the project's exact pins with ranges such as `^0.7.16`, so a later install could bring a CLI from another release than the project's Core.

@josephfarina
