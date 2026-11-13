---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: `undo <theme> headings Tracking` (or `TRACKING`, `Tight`) removes the tracking half, never the weight half; a change removes only the pictures the editor took (and only while they are as it wrote them), never a file of the user's, and marks the section sheets `show --section` made as out of date (in `sheetStale`) instead of deleting them; a link in the theme folder whose target is gone is named with where it points, by `set` and by `undo` alike, instead of a copy step that fails or "Nothing to undo".

@josephfarina
