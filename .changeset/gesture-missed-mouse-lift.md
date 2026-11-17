---
'@astryxdesign/core': patch
---

[fix] A mouse drag released outside the page, such as outside a sandboxed frame an embed shows the page in, now ends as soon as the pointer comes back or presses again. Before, a Slider thumb, a pan or a sheet stayed held and followed the pointer with no button down.

@josephfarina
