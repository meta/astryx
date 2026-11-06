---
'@astryxdesign/core': patch
---

[fix] `Dialog`: when a `DialogHeader` mounts in the same render that opens the dialog, its title now takes focus only after the dialog is modal, so focus never reaches the dialog's content before the page behind it is blocked. The title is still the default focus target when no other control asks for focus.

@cixzhang
