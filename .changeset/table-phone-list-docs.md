---
'@astryxdesign/core': patch
---

[docs] Table's docs say that column floors wider than the screen make the table scroll sideways on a phone, and how a page read mostly on phones can show its rows as a List below a breakpoint instead: render both, and switch them with a StyleX `display` rule under a media query, so the first paint and a viewer without script already show the right layout.

@josephfarina
