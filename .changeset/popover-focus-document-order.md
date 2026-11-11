---
'@astryxdesign/core': patch
---

[fix] Popover: initial focus takes the first content control in document order everywhere. This changes the focused control only where `querySelectorAll` does not return document order, as in jsdom; browsers focus the same control as before.

@cixzhang
