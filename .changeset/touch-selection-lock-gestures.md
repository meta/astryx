---
'@astryxdesign/core': patch
---

[chore] Internal: the gesture host takes the press feedback's selection lock for a press-tracked control's contact and for a recognizer created with `preventsTextSelection`, a non-text input under the finger included, and restores selection when the contact ends. Not exported from the package entry point; no component uses it yet.

@vjeux
