---
'@astryxdesign/core': patch
---

[fix] In a clickable `Stepper`, a disabled `Step` now keeps its button: it stays in the tab order, is announced as unavailable (`aria-disabled`), and keeps focus if it becomes disabled while focused, but still does not activate. Its description (the reason it is unavailable) describes the button (`spec:AST-085` FR1, FR4, FR5). Before, it rendered as plain text, so keyboard and screen-reader users could not find it or tell it was unavailable.

@cixzhang
