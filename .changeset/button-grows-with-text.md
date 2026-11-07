---
'@astryxdesign/core': patch
---

[fix] A labelled `Button` grows with its label when the text size grows (as under iOS Dynamic Type). Its size is now a minimum height, so the label stays inside its own tap target, and stacked buttons no longer take each other's taps. At the default text size every button keeps its size, and icon-only buttons keep their fixed square size.

@cixzhang
