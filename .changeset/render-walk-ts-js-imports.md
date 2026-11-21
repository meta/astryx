---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export` follows an import written the TypeScript way, such as `./helper.js` for `helper.ts`, to its source when it looks for the files a page uses. A module from outside the carried folder that imports one now gets that file named in `notCarried` too.

@josephfarina
