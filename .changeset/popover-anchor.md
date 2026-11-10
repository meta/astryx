---
'@astryxdesign/core': patch
---

[feat] `usePopover` takes an `anchor`: the element the popover sits on when it is not the control that opens it. Pass a ref to an element with a CSS box (an HTML element such as a card or a table cell, or an `<svg>` element; not a shape inside an `<svg>`, which warns in development) or a function that returns one. A `show()` before the anchor exists waits, and opens when the anchor is next read and resolves: a ref on the next render of your component, a function when you pass a new one or call `show()` again. A function is read when the popover opens and when you pass a different function, so a popover can move between rows without closing. The trigger keeps its toggle and ARIA, and the anchor gets neither. A composition with an anchor and no trigger opens through `show()`. The `Popover` component is unchanged.

@nynexman4464
