---
'@astryxdesign/cli': patch
---

[perf] `theme build` keeps the transpiled code of the theme sources it loads in the per-user transpile cache, as the CLI already does for integration manifests and TypeScript docs, so a build of an unchanged theme no longer transpiles it again: about 150 ms faster per build. An edited theme is transpiled again. The cache folder now stays within the same size limit as the kept catalogs: once it has grown, a run removes its least recently used transpiled copies, never one used in the last day. `doctor`'s "Kept catalog cache" row now names that limit. Other output does not change.

@josephfarina
