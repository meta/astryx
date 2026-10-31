---
'@astryxdesign/core': patch
---

[fix] Focusing a control inside a `ClickableCard` or `SelectableCard` (a button in its children) no longer also rings the whole card: each tab stop shows one focus ring. The card rings only for its own link, button or checkbox.

@cixzhang
