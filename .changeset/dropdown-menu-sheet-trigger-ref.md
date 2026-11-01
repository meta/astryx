---
'@astryxdesign/core': patch
---

[fix] `DropdownMenu` and `MoreMenu` now forward the caller's ref to the trigger button in the bottom-sheet presentation (`architecture:public-component-api` INV8). Before, `presentation="bottom-sheet"`, or `presentation="adaptive"` on a compact touch screen, replaced the `button.ref` (and the `ref` that `MoreMenu` passes) with an internal ref, so a caller's ref stayed empty. The popover presentation already forwarded it. Apps need no code change.

@parinith-web
