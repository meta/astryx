---
'@astryxdesign/core': patch
---

[fix] In an open Selector, MultiSelector, CommandPalette, DateTimeInput time list or Chat trigger menu, a key that scrolls the list (End, Home, PageDown, type-to-select) keeps the highlight where the key put it, even when the mouse is resting over the list. Before, the row that scrolled under the still pointer took the highlight. A mouse that moves or presses still takes it.

@cixzhang
