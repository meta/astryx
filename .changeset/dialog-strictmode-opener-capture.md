---
'@astryxdesign/core': patch
---

[fix] Dialog: under React StrictMode, a `Dialog` with a `DialogHeader` first mounted open now returns focus to the element that opened it on close, instead of leaving focus on the page body. The opener is captured only on the closed-to-open edge.

@HelloOjasMutreja
