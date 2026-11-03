---
'@astryxdesign/core': patch
---

[feat] `useTooltip` returns `show()` and `hide()`. `show()` opens the tooltip and keeps it open until `hide()`, Escape, a press outside, or focus leaving its trigger, and its text is announced once. `hide()` closes it. Both fire `onShow` and `onHide`. Under a controlled `isOpen`, they only call those callbacks. Use them to build a toggle-style trigger: your own button calls them on each press, sets `aria-expanded` and `aria-controls={describedBy}`, and keeps its own accessible name.

@cixzhang
