---
'@astryxdesign/core': patch
---

[feat] Popover and `usePopover` take an `anchor`: the element the popover sits on when it is not the control that opens it. Pass a ref to any element (a card, a table cell, a chart region) or a function that returns one; a function is read again when the page changes, so a popover can follow a row whose control remounts without closing. The trigger keeps its toggle and ARIA, and the anchor gets neither. A `Popover` with `anchor` and no trigger opens through `isOpen`.

@nynexman4464
