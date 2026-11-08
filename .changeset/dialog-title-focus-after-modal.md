---
'@astryxdesign/core': patch
---

[fix] `Dialog`: a `DialogHeader` title now takes focus only after the dialog is modal, also when the header mounts in the render that opens the dialog. When no other control asks for focus, initial focus now starts on the title in every browser. Before, a header with a start control, and any header in Firefox, started on the first control.

@cixzhang
