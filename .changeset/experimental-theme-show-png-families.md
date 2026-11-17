---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor show --png` takes the sample page, the open states, and one picture for each family of components the theme sets a part of with `--on` (actions, inputs, selection, navigation, feedback, data or containers; the buttons when it sets none), each cut from the full sheet: `sheet-<family>.png` from the `sheet-<family>.html` it writes beside the sheet. The full sheet, every component, is still written as sheet.html but is no longer pictured as sheet.png, which was too tall to read whole. `show --section <family> --png` takes any other family. The result names the family pictures first among the pictures to open.

@josephfarina
