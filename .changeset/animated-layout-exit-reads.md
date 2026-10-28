---
'@astryxdesign/core': patch
---

[perf] With an `animatedLayout` handle, a Collapsible or TreeList change in a long list reads every row's place before any glide starts, so the page is laid out once rather than once per gliding row.

@cixzhang
