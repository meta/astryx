---
'@astryxdesign/core': patch
---

[fix] Table writes its column and plugin identity caches only at commit. After a render React discards, as a suspended transition does, the next committed render reuses them, so rows skip rendering when the columns and plugins match the committed ones. A column plugin with its own render-time cache, such as the tree plugin, still re-renders every row.

@vjeux
