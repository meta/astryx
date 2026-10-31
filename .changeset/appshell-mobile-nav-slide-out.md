---
'@astryxdesign/core': patch
---

[fix] AppShell keeps the mobile nav's drawer rendered until its slide-out ends, at most 550 ms. It no longer hides the drawer 300 ms after a close, partway through the slide-out (410 ms by default).

@vjeux
