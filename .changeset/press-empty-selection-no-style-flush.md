---
'@astryxdesign/core': patch
---

[perf] A mouse or pen press with no text selected no longer brings the page's pending styles up to date. The gesture host reads the selection's ranges only when text is selected, so a press on a control such as SegmentedControl no longer restyles unrelated content first. A claimed drag still keeps a selection the page has.
