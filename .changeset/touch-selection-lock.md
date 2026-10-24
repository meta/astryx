---
'@astryxdesign/core': patch
---

[experimental] A held finger or pen no longer starts text selection or the iOS callout on a press-tracked control or cell, or on a recognizer created with the new `preventsTextSelection` option (`@astryxdesign/core/gestures/experimental`), as on UIKit controls. The gesture host turns them off for the contact and restores them when it ends, on a non-text input under the finger inside such an element too (WebKit's own style makes every input selectable), and only for recognizers that would take the touch; the document press controller (`usePressFeedback` rows) takes the same lock on any coarse pointer. Text fields keep their selection, a mouse keeps desktop selection, and other pans leave their content selectable.

@vjeux
