---
'@astryxdesign/core': patch
---

[fix] Toolbar lets its horizontal two-slot start lane take the remaining width and wrap at narrow widths. A single-row OverflowList publishes its collapsed minimum inline size (rounded up so the trigger fits) and, only inside Toolbar's growing start lane, takes size containment so its unfolded items do not floor the lane. Outside that lane the list keeps its content-sized width, and an observeSelf list is never capped below the width it is given, so overflowing actions collapse beside endContent without clipping the trigger or siblings and grow back when space returns.
@quocluongg
