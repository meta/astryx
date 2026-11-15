---
'@astryxdesign/core': patch
---

[fix] Dialog: a DialogHeader that mounts after the dialog opens now names the dialog, and the name goes away when the header unmounts. A dialog's own `aria-label` or `aria-labelledby` still wins.

@cixzhang
