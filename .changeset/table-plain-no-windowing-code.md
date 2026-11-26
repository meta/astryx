---
'@astryxdesign/core': patch
---

[perf] Table: a Table that does not window its rows no longer loads the row windowing code. A page with a plain Table loads about 3.5 KB less JavaScript (gzip). `useTableRowsVirtualization` now carries the row window, so only a Table that opts in loads it. Adding or removing row virtualization on a mounted Table remounts it, as the Table's compatibility rules already state.

@cixzhang
