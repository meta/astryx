---
'@astryxdesign/core': patch
---

[fix] Tokenizer: with `hasEntriesOnFocus`, picking a choice from the list shown on focus keeps the input focused and the list open, with the next choice active, so you can pick several in a row. The list closes when no choice remains, at `maxEntries`, or when you press elsewhere, Tab away or press Escape. A pick from typed search results still closes the list.

@fullstackhacker @cixzhang
