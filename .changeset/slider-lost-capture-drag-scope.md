---
'@astryxdesign/core': patch
---

[fix] Slider: the document listener that ends a drag when its pointer capture is lost now exists only while a drag is in progress, so an idle slider no longer holds a document-level listener for its whole lifetime. A drag still ends when the control is replaced mid-drag (a FormLayout direction change).

@cixzhang
