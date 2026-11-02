---
'@astryxdesign/cli': patch
---

[perf] Calling `integrationComponentConflicts()` or `integrationCheck()` from `@astryxdesign/cli/api` more than once in one process now reads each TypeScript file a package's `tsconfig.json` includes once while the file is unchanged, instead of on every call. A single `astryx doctor integration components` or `astryx integration check` run is unchanged. (#9422)

@vjeux
