---
'@astryxdesign/cli': patch
---

[fix] `astryx init` next steps and the `doctor` theme hint name the project's own install command (`pnpm add`, `yarn add`, `bun add` or `npm install`) instead of `npm install` in every project. An install command the CLI prints no longer adds a `@"*"` range to a package name.

@josephfarina
