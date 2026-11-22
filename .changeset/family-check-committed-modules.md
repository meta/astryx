---
'@astryxdesign/cli': patch
---

[fix] `theme build --family --check` reports a family whose member has a local TypeScript or JSX registry up to date right after its build: when every module the build compiles matches its committed copy in `<family-key>.modules/`, it checks each compiled registry by importing that committed copy, and writes nothing. A copy that is stale or missing is reported by the comparison of the outputs.

@josephfarina
