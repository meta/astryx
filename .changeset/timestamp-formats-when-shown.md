---
'@astryxdesign/core': patch
---

[perf] A relative Timestamp builds a third of the date formatters it built before as it renders. Its hover card formats its rows only when it shows. A Timestamp in the `time` format pinned to a time zone builds no formatter after its first render. Every string it writes stays the same.

@vjeux
