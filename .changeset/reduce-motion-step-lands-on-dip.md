---
'@astryxdesign/core': patch
---

[fix] Under Reduce Motion on a touch screen, a step on a DateInput, TimeInput or DateTimeInput wheel, and a month step in the touch calendar, change under their cross-fade even on a busy page. Before, the change landed on a timer at the fade's middle, and a busy page could fire it after the fade had ended, so the rows or the month moved fully visible. Now the change lands when the fade-out ends, on the fade's own timeline, and the fade-in starts only after it, so it never shows at full opacity. The month's dip now eases each half, as the wheels' does.

@vjeux
