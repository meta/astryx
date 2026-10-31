---
'@astryxdesign/core': patch
---

[fix] A Dialog mounted already open no longer scrolls its scroll containers when it opens. DialogHeader focused its title before the dialog became modal, so the focus scrolled every scroll container above the not-yet-modal dialog to reveal it, and they stayed scrolled. Dialog now focuses the DialogHeader title right after it opens modally (component:Dialog FR1); a header that mounts into an already open Dialog still takes focus on mount.

@cixzhang
