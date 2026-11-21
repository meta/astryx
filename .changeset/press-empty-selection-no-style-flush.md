---
'@astryxdesign/core': patch
---

[perf] A mouse or pen press reads the page's selection only when one may exist. The gesture host notes each `selectionchange` and skips the read when no selection can exist, because in Chromium every read of a selection brings the page's pending styles up to date. A claimed drag still keeps a selection the page has, including one inside an open shadow root.
