---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview app` refuses a starter whose theme reaches a file outside its folder with `import x = require('…')`, or with a `/// <reference path="…" />` at the top of a file, which the new app's type check reads, as for any import.

@josephfarina
