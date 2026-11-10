---
'@astryxdesign/core': patch
---

[feat] `usePopover` takes an `anchor`: the element the popover sits on when it is not the control that opens it. Pass a ref to any element (a card, a table cell, a chart region) or a function that returns one. A function is read when the popover opens and when you pass a different function, so a popover can move between rows without closing. The trigger keeps its toggle and ARIA, and the anchor gets neither. A composition with an anchor and no trigger opens through `show()`. The `Popover` component is unchanged.

@nynexman4464
