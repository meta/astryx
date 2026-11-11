---
'@astryxdesign/core': patch
---

[fix] On a phone, a press on a control at rest no longer measures the page, so a scroll that starts there does not wait. Hit areas no longer measure while the page scrolls or while a parent's animation moves them, such as a screen that slides in. A press on a control that a parent moves still measures the page. When a parent starts to move after the last measurement, the browser's own hit test decides the tap. No API changes.

@vjeux
