---
'@astryxdesign/cli': patch
---

[fix] `astryx docs <topic>` reads a topic authored as `.doc.ts` from an installed integration on every supported Node, and from a linked integration below Node 22.18. Topic and docs-tree files now load `.ts` through the same TypeScript loader as component docs, where a plain import failed under `node_modules` ("Stripping types is currently unsupported") and below Node 22.18 ("Unknown file extension .ts"). `.doc.mjs` topics load as before.

@cixzhang
