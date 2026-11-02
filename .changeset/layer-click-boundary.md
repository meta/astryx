---
'@astryxdesign/core': patch
---

[fix] A press inside an open layer (a popover, tooltip, hover card, menu, dialog, drawer, lightbox, mobile navigation, bottom sheet or toast) no longer runs click, pointer, mouse or touch handlers on the elements around where the layer is written. Before, a click inside a menu written inside a clickable card or row could also activate that card or row. Handlers inside the layer, capture-phase handlers, and document and window listeners still receive the press. A handler that needs presses inside a layer belongs on the layer's content.

`SelectableCard`: a click inside an open layer within the card (such as a popover's content) no longer toggles it. Until the next minor, the caller's `onClick` still receives that click, now during the capture phase, so before the layer's own handlers.

@cixzhang
