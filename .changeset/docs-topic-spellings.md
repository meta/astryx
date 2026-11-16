---
'@astryxdesign/cli': patch
---

[fix] `astryx docs <topic>` opens a page typed in another spelling of its route: spaces, hyphens, slashes, dots and underscores all separate words, and word order does not count (`docs tokens.tokens-color` opens `tokens/tokens-color`). When the typed words only name a page and no other command's entry matches, the miss suggests the pages whose title or declared keywords carry them, closest first (`docs theming` suggests the Theming topic first), keeps a route the typed words name first, and never lists more than before; a namespace's children are ordered the same way.

@josephfarina
