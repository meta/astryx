---
'@astryxdesign/core': patch
---

[perf] Importing `Text` or `Heading` no longer loads the Layer touch trigger and the press and motion code it reaches: importing `Text` drops from 12,129 to 10,312 bytes gzip. The truncation tooltip keeps waiting for a tap the same way, through a smaller shared module. If the Tooltip module fails to load, the text stays as it is, and the next hover, tap or focus asks the module loader again; a bundler's loader can retry, while a browser's native `import()` does not fetch a failed module again.

@rhagigi
