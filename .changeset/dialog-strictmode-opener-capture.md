---
'@astryxdesign/core': patch
---

[fix] Dialog: under React StrictMode, a `Dialog` with a `DialogHeader` that is first mounted open and then removed while open (rendered only while open) now returns focus to the element that opened it, instead of leaving focus on the page body. The opener is captured only on the closed-to-open edge.

@HelloOjasMutreja @cixzhang
