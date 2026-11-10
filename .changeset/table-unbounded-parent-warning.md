---
'@astryxdesign/core': patch
---

[fix] A windowed Table warns in development when its parent gives it no height, so its scroll area grows as tall as all of its rows and every row mounts. Give the Table's parent a height so windowing can bound the rows.

@humbertovirtudes
