---
'@astryxdesign/core': patch
---

[fix] A window blur during a pen's press, or during a press by a finger read from its pointer events, now ends it with nothing acting at the later lift, on every surface: a `Switch` no longer toggles at that pen's click. Where fingers come from pointer events, a second finger leaves both to the page's pinch even when the first rests on plain page. A disabled recognizer brings no blocking listener.

@vjeux
