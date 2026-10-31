---
'@astryxdesign/core': patch
---

[fix] A read-only CheckboxInput, and the checkboxes of a read-only CheckboxList, no longer show pressed feedback: their value is shown but cannot change, so a press on them paints nothing, with a mouse or a finger. A read-only row that carries its own click handler still presses as a row.

@vjeux
