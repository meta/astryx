---
'@astryxdesign/core': patch
---

[fix] A layer's trigger (Tooltip, Popover, HoverCard, DropdownMenu, ContextMenu and every other `useLayer` caller) now carries its CSS `anchor-name` only while the layer is shown or its exit animation runs. A closed trigger is no anchor, so in WebKit's Linux ports a transform animation on an element that contains a closed trigger keeps running while the main thread is busy. A layer that fades out keeps its trigger's anchor name until the fade ends. If you write a layer's `anchorId` as an anchor name yourself, write it only while the layer is shown or its exit animation runs.

@vjeux
