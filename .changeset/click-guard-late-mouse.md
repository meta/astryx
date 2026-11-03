---
'@astryxdesign/core': patch
---

[fix] After a gesture takes a touch, the page no longer sees that touch's late `mousedown` and `mouseup`. WebKit sends them a few milliseconds after a held tap's cancelled `touchend`, aimed at whatever is under the finger by then; they now go with the click.

@vjeux
