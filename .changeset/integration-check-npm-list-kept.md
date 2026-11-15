---
'@astryxdesign/cli': patch
---

[perf] `astryx integration check` and `astryx doctor integration validate` in a package's own folder keep npm's list of the files the package packs, and read it back while no folder in the package, its package.json, an ignore file in any folder or an npmrc file npm reads has changed. Which files npm packs never depends on what they hold, so a run after an edit inside a file skips npm, which took seconds for a large package: each check finished about 2.6 seconds sooner there. A package that bundles dependencies, or has a link in its folders, is asked every time. Output does not change.

@josephfarina
