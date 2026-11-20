---
'@astryxdesign/core': patch
---

[fix] Dialog: a DialogHeader that mounts after the dialog opens now names the dialog, and the name goes away when the header unmounts. A dialog's own `aria-label` or `aria-labelledby` wins, and an `aria-label` that arrives while the header is mounted now names the dialog instead of losing to the header title.

@cixzhang
