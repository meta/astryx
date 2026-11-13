---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: going back to the preview's bare URL shows its first page, as a reload does. `editor undo` points its `see` line at the page about what it reverted. A preview whose URL depends on the app's routing, or whose folder was renamed by hand, is named where it is, by `see` and by `preview list`, instead of suggesting a new one. `preview add --theme` takes a pasted label (`theme: t`, `name: t`) as the theme t; an editor command given one refuses it and suggests `show t`. A change the editor could not render says why in its `see` line instead of pointing at a `preview.html` it did not write.

@josephfarina
