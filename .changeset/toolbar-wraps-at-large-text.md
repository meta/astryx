---
'@astryxdesign/core': patch
---

[fix] A `Toolbar` with `centerContent` wraps its row when its lanes don't fit, as at a larger text size on a phone, instead of letting the center title spill over the buttons beside it and past the screen's edge. The end lane, and the center lane when it does not fit beside the start lane, move to a following line. The center sits at the toolbar's middle as before while each side lane fits in half of the width it leaves. In a narrow container, a center `TabList` now shows all its tabs and the row wraps, and its tabs scroll only when they are wider than the toolbar.

@cixzhang
