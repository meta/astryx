---
'@astryxdesign/core': patch
---

[fix] `Layout`: a `false`, `true`, or empty-string slot, such as `false` from `isOpen && <LayoutPanel />`, now counts as empty. The neighbouring regions move out to the layout edge, the same as when the slot is omitted, and with `contentWidth` a closed side panel no longer stops the content area at the content-width frame. The docs now list `children` and `ref`, show how to hide a region, and say that landmark roles go on the region components.

@cixzhang
