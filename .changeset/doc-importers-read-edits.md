---
'@astryxdesign/cli': patch
---

[fix] A long-running process that calls the CLI's API, such as a docs site's search route, now reads an edited CommonJS `.doc.js` file again in docs, search and template reads. It read the doc as first loaded.

@vjeux
