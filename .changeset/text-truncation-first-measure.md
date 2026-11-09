---
'@astryxdesign/core': patch
---

[perf] Truncating Text and Heading take a newly mounted element's first measurement from the shared resize observer's first notification, after the browser's own layout, instead of forcing a layout pass after each commit. Pages and windowed tables that mount many truncating texts commit faster; the tooltip behaves as before.

@humbertovirtudes
