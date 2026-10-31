---
'@astryxdesign/core': patch
---

[perf] useOverflow: `rows` and `rowHeight` are measured and tracked on the multi-row path only (`maxRows` above 1), where the container's height renders from them. On the single-line path the hook reports `rows: 1` and `rowHeight: 0` without measuring, so a host that reads neither (every single-line `OverflowList`) no longer re-renders when the first measurement finds the item height.

@vjeux
