---
'@astryxdesign/cli': patch
---

[perf] Importing `@astryxdesign/cli/api`, as integration codemods and other integration code do, no longer loads Babel, recast, jscodeshift and postcss-selector-parser up front: each loads the first time it is used (about 0.25 s and 350 fewer modules per import). The API's exports are unchanged.

@josephfarina
