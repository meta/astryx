---
'@astryxdesign/core': patch
---

[experimental] The gesture host takes the same selection lock: for a press-tracked control's contact, and for a recognizer created with the new `preventsTextSelection` option (`@astryxdesign/core/gestures/experimental`) when it would take the touch. It also covers a non-text input under the finger inside such an element (WebKit's own style makes every input selectable), and restores selection when the contact ends. Other pans leave their content selectable.

@vjeux
