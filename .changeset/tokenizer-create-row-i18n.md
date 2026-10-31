---
'@astryxdesign/core': patch
---

[fix] Tokenizer: the inline create row now takes its `Create "…"` label from the `@astryx.tokenizer.create` message, the same one the bottom sheet uses, so it follows the provider's locale instead of always reading in English. Fixes #8931.

@nynexman4464
