---
'@astryxdesign/core': patch
---

[fix] Selector with `hasSearch`: a required field no longer puts `aria-required` on its trigger, a button where the attribute is not allowed. The search field carries it while the list is open, and the closed trigger still announces "Required", through the field label or, when the label shows no marker, through its description.

@cixzhang
