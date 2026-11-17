---
'@astryxdesign/core': patch
---

[fix] A layer's exit copy, which a touch close plays on, keeps the padding, border and colors of the element it copies. Before, the browser's popover style padded, bordered and painted it, so a surface with no padding of its own drew its content inset during the close.

@vjeux
