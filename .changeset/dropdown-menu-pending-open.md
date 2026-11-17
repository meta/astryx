---
'@astryxdesign/core': patch
---

[fix] A `DropdownMenu` whose layer opens after its trigger becomes a valid anchor now takes focus as it opens, and fires `onClick` once. A menu in a native `<dialog>` that the page displays closed opens one commit after the press. The menu read that open as refused, so focus stayed on the trigger and `onClick` never fired.

@vjeux
