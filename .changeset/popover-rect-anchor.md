---
'@astryxdesign/core': patch
---

[feat] A Popover `anchor` can be a rectangle: an object with `getBoundingClientRect()` and an optional `contextElement`. Use it for a point a press landed on, or a range of text, when you hold no element. When the popover opens, a box the rectangle's size is placed inside `contextElement`, so it scrolls with that element's content. The box takes no pointer input and is hidden from assistive technology.

@nynexman4464
