---
'@astryxdesign/core': patch
---

[fix] useAnnounce: messages announced in the same frame are now joined, in order, into one announcement instead of the last one replacing the others, and an identical repeat is spoken once, so a screen reader no longer misses an earlier status such as a result count announced alongside a confirmation. An empty message still clears the region, including joined messages not yet spoken. This meets the shared-channel requirement in spec:AST-086 (FR9). Introduced in #8244; final-state evidence (#8294).

@cixzhang
