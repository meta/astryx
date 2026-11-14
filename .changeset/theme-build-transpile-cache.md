---
'@astryxdesign/cli': patch
---

[perf] `theme build` keeps the transpiled code of the theme sources it loads in the transpile cache the CLI already uses for integration manifests and TypeScript docs, so a build of an unchanged theme no longer transpiles it again: about 150 ms faster per build. An edited theme is transpiled again. On systems with user ids, that cache is the per-user one, which now stays within the same size limit as the kept catalogs: once it has grown, a run removes its least recently used transpiled copies, never one written in the last day or read in the last day where the file system records reads. `doctor`'s "Kept catalog cache" row now names that limit. Other output does not change.

@josephfarina
