---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build --watch` rebuilds when a file a theme brings in with TypeScript's `import x = require('./file')` changes, as it does for any other import.

@josephfarina
