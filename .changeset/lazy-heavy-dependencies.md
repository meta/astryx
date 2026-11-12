---
'@astryxdesign/cli': patch
---

[perf] Importing `@astryxdesign/cli/api`, as integration codemods and other integration code do, no longer loads Babel, recast, jscodeshift and postcss-selector-parser up front: each loads the first time it is used (about 0.25 s and a thousand fewer modules per import). The API's exports are unchanged. On an install missing one of those packages, the error now comes when it is first used rather than at import.

@josephfarina
