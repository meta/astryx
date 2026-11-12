---
'@astryxdesign/cli': patch
---

[docs] `astryx docs authoring/ship/publishing` gains "Ship JavaScript files": the CLI transpiles each TypeScript file it loads from an integration (manifest, doc topics, codemods) on first read per machine, so publishing `astryx.integration.mjs`, `.doc.mjs` topics and `.mjs` codemods makes commands in apps start faster; and a package with two manifests fails to load.

@josephfarina
