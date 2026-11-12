---
'@astryxdesign/core': patch
---

[fix] The mobile keyboard hook syncs its enabled, expanded and open flags at commit. After a render React discards, as a suspended transition does, a dismissal and the keyboard's listeners follow the committed options.

@vjeux
