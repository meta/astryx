---
'@astryxdesign/core': patch
---

[fix] `DropdownMenuRadioItem` now runs a caller's `onClick` and `onPointerMove`. Before, the row's own selection and hover-focus handlers replaced them, so they never ran. They now run after the row selects its value and takes hover focus, as they already do on `DropdownMenuItem` and `DropdownMenuCheckboxItem`; a disabled row still selects nothing and does not call `onClick`. The documentation also marks `value` and `label` as required and no longer says disabled radio items stay reachable with the arrow keys, which DropdownMenu currently skips.

@cixzhang
