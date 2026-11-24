---
'@astryxdesign/core': patch
---

[fix] A Table given `useTableRowsVirtualization` warns once in development when its parent gives it no height, so its scroll area grows as tall as all of its rows and every row mounts. Give the Table's parent a height so windowing can bound the rows. A sized parent with room for every row does not warn, and rendering is unchanged.

@humbertovirtudes
