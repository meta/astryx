---
'@astryxdesign/core': patch
---

[perf] DateTimeInput: the popover's Calendar loads when a person first points at, focuses or presses the date field, not with the page. A page whose only Calendar comes from DateTimeInput loads about 3 KB less JavaScript (gzip). The popover opens once its Calendar has loaded, so it never shows without it. If the Calendar fails to load, the field stays closed and the page keeps working; reloading the page loads the Calendar again. DateTimeInput and DateRangeInput now share one Calendar load.

@cixzhang
