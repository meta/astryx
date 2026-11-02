---
'@astryxdesign/core': patch
---

[fix] useLayer: a show that a browser-run popover hide refuses (Chromium 156 throws an `InvalidStateError`) is replayed once that hide has ended, so the layer ends shown. For example, when the browser's own Escape closes a light-dismissible layer, the tooltip on the button that opened it now shows instead of failing.

@vjeux
