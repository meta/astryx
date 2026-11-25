---
'@astryxdesign/core': patch
---

[perf] DateRangeInput: the popover's Calendar loads when a person first points at, focuses or presses the field, not with the page. A page with a DateRangeInput loads about 10 KB less JavaScript (gzip). The popover opens once its Calendar has loaded, so it never shows without it. If the Calendar fails to load, the field stays closed and the page keeps working; reloading the page loads the Calendar again.

@cixzhang
