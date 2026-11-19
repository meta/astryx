---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental theme editor`: a border, corners, shadow, fill or outline asked of a component whose controls sit side by side in a row that frames them (Pagination's pages in `pagination-list`) go on that row, so the controls draw one strip. `set` writes each on the row and says so with its undo, so a theme saved with them on `pagination` builds the strip; `how` offers them there. Neither offers a border or corners on each page any more.
