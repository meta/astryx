---
'@astryxdesign/cli': patch
---

[fix] `astryx docs <topic>` reads a topic authored as `.doc.ts` from an installed integration on every supported Node, and from a linked integration below Node 22.18. Topic and docs-tree files now load `.ts` through the same TypeScript loader as component docs, where a plain import failed under `node_modules` ("Stripping types is currently unsupported") and below Node 22.18 ("Unknown file extension .ts"). `astryx search` also reads an installed `.doc.ts` component doc, so it finds the component by its keywords, shows its description, and lists a family's members. `.doc.mjs` topics load as before.

@cixzhang
