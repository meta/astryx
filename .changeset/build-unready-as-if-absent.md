---
'@astryxdesign/cli': patch
---

[fix] `astryx build` reads search as if a page template that is not ready yet were absent: such a template no longer takes a search result's place, so the page list, the block suggestions and the rest of the kit are what they would be without it. When the idea names a not-ready template, the reason still says so even if another not-ready template ranks above it.

@josephfarina
