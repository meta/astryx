---
'@astryxdesign/core': patch
---

[fix] In TabList's default `hug` layout, a `Tab` and a `TabMenu` trigger no longer shrink below their labels. On a page whose CSS lets flex items shrink below their content (a `min-width: 0` reset), a narrow strip squeezed its stops until the labels drew over one another, before overflow could scroll. Each hugging stop now keeps its width and the strip scrolls, as its overflow handling intends; `fill` tabs still share the strip.

@light-merlin-dark
