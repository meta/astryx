---
'@astryxdesign/core': patch
---

[fix] A mouse drag in a page shown in a sandboxed frame (such as an embed or a viewer) that is released outside the browser window now ends when the pointer comes back over the frame or presses again. Before, a Slider thumb or a pan stayed held and followed the pointer with no button down.

@josephfarina
