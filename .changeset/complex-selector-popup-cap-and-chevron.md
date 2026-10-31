---
'@astryxdesign/core': patch
---

[fix] ComplexSelector's popup content keeps its last rows clear of a bottom bar the app declares through `LayerProvider`'s `inset`, instead of scrolling them underneath it, and its chevron turns at once when the person prefers reduced motion instead of animating its rotation.

@cixzhang
