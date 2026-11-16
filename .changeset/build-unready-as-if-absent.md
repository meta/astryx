---
'@astryxdesign/cli': patch
---

[fix] A page template that is not ready yet no longer takes one of the places in the search results `astryx build` reads, so it no longer pushes a page, a block suggestion or a component out of build's kit; `matchCount` still counts it. When the idea names a not-ready template, the reason still says so even if another not-ready template ranks above it.

@josephfarina
