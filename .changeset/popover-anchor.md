---
'@astryxdesign/core': patch
---

[feat] `usePopover` takes an `anchorRef`: a ref to the element the popover sits on when it is not the control that opens it. Any element with a CSS box works (an HTML element such as a card or a table cell, or an `<svg>` element; a shape inside an `<svg>` warns in development). The trigger keeps its toggle and ARIA, and the anchor gets neither. The ref is read when the popover opens, on each render of your component, and on each `show()`, so a popover with `hasLightDismiss: false` moves between rows without closing when you set `anchorRef.current` and call `show()`. With light dismiss on, the press on the other row closes the popover first, and `show()` opens it again on the new element. A `show()` before the ref holds an element waits, and opens when the ref is next read and holds one. A composition with an anchor and no trigger opens through `show()`. The `Popover` component and its own `anchorRef` are unchanged.

@nynexman4464
