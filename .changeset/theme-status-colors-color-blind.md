---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: status colors are checked for color-blind readers.

When the theme changes a status fill (info, success, warning, danger) and two of them may look alike to someone red-weak or green-weak, `set` and `show` say so. The note includes a line that moves one of the pair lighter or darker. `how` answers color-blind questions with what the editor checks and how to keep statuses apart.

@josephfarina
