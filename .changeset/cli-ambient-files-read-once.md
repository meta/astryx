---
'@astryxdesign/cli': patch
---

[perf] `astryx doctor` and integration validation now read each TypeScript file a package's `tsconfig.json` includes once per run while the file is unchanged, to tell whether it declares ambient types, instead of reading every included file again on each check that reads the config. On a package whose config includes its whole source tree, that reading was about a third of `doctor integration components`'s time.

@vjeux
