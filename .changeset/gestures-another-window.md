---
'@astryxdesign/core': patch
---

[fix] Touch gestures work on a component rendered into another window's document, such as a same-origin iframe or a Document Picture-in-Picture window. The gesture host checked nodes and touches against this window's classes, so it ignored that window's own. A finger's scroll and a layer's input hold are read there too.

@vjeux
