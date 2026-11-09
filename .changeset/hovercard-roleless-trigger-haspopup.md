---
'@astryxdesign/core': patch
---

[fix] HoverCard: a labelled card no longer puts `aria-haspopup="dialog"` on a role-less trigger, such as text or a `<time>`. Such a trigger names the open card through `aria-controls` only; a button or link trigger still gets `aria-haspopup` and `aria-expanded`.
@cixzhang
