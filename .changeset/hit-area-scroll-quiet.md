---
'@astryxdesign/core': patch
---

[fix] On a phone, a finger that starts a scroll on a control no longer waits while touch hit areas measure the page. Hit areas no longer measure while the page scrolls or while a parent animates, such as a screen that slides in. A tap still never reaches a neighbor that is nearer the finger. No API changes.

@vjeux
