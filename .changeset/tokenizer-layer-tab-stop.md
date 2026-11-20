---
'@astryxdesign/core': patch
---

[fix] Tokenizer: with `tokenOverflowBehavior="unfocusedLayer"`, keyboard users can now Tab to the collapsed field. Its placeholder takes the tab stop and opens the field with focus in the input, even when it holds no tokens. A disabled field keeps that stop, says it is disabled, shows its `disabledMessage`, and opens nothing; no element is natively disabled.

@cixzhang
