---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental theme editor`: a border, corners, shadow, fill or outline asked of a component whose controls sit side by side in a row that frames them (Pagination's pages in `pagination-list`) go on that row, so the controls draw one strip. `set` and `how` no longer offer a border or corners on each control, which boxed each page apart, and no longer put a shadow, fill or outline on the page-wide bar around them.
