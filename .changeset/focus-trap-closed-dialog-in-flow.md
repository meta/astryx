---
'@astryxdesign/core': patch
---

[fix] Tab moves through a `Popover` or a `DropdownMenu` that opens inside a native `<dialog>` that the page displays closed. Tab and Shift+Tab wrap at the layer's edges, and a `DropdownMenu`'s header and footer are Tab stops again. The focus trap counted every control in a closed dialog as hidden, so it found no Tab stops and held focus in place.

A closed dialog that the page displays has a box, so its controls are Tab stops. A closed dialog with `display: none` has no box, and its controls stay out of the Tab cycle.

@vjeux
