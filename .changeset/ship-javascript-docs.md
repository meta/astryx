---
'@astryxdesign/cli': patch
---

[docs] `astryx docs authoring/ship/publishing` recommends shipping `astryx.integration.mjs` rather than `.ts` (and `.mjs` doc files and codemods): the CLI transpiles each TypeScript file it loads on first read per machine. It also says a package with two manifests fails to load.

@josephfarina
