---
'@astryxdesign/core': patch
---

[fix] In a List with `hasDividers`, a hovered or pressed row keeps both of its dividers visible through its tint, with a mouse and under a finger. The divider above the row used to merge into the tint, and under a finger both dividers did. The dividers keep `--color-border`; nothing hides.

@vjeux
