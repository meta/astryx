---
'@astryxdesign/core': patch
---

[fix] Dialog: with reduced motion on a touch screen, the dialog fades in where it lands, in 200 ms or less, instead of appearing with no transition. With a mouse it still appears at once, and it never slides or scales in under reduced motion (design:reduced-motion).

@vjeux
