---
'@astryxdesign/core': patch
---

[perf] Text: a truncation measurement that finds the same result no longer schedules a state update, so a page that mounts many truncating texts at once, such as a wide windowed Table, does less work. `useTruncation` returns the same values as before.

@cixzhang
