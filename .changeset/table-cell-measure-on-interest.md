---
'@astryxdesign/core': patch
---

[perf] Table: with `textOverflow="truncate"`, a default cell checks whether its text is cut off on its first hover, tap or focus instead of when it mounts. A wide table that windows its columns scrolls with less work, and a cut-off cell still shows its full text in a tooltip on hover.

@cixzhang
