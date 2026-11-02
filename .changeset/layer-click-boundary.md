---
'@astryxdesign/core': patch
---

[fix] A press inside an open layer (a popover, tooltip, hover card, menu, dialog, drawer, lightbox, mobile navigation, bottom sheet or toast) no longer runs click, pointer, mouse or touch handlers on the elements around where the layer is written. Before, a click inside a menu written inside a clickable card or row could also activate that card or row. Handlers inside the layer, capture-phase handlers, and document and window listeners still receive the press. A handler that needs presses inside a layer belongs on the layer's content.

`SelectableCard` keeps its caller `onClick` behavior until the next minor: a click inside an open layer within the card still calls `onClick`, now during the capture phase, so before the layer's own handlers. It still does not toggle the card.

@cixzhang
