---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor show --png` takes the sample page, the open states, and one picture for each family of components the theme sets a part of with `--on`, a group of parts counting as its parts (actions, inputs, selection, navigation, feedback, data or containers; the buttons when it sets none), each cut from the full sheet: `sheet-<family>.png` from the `sheet-<family>.html` it writes beside the sheet. A family taller than 1600px is cut between rows of parts into pictures of about that height, in order (`sheet-<family>-1.png`, `-2` …). The full sheet, every component, is still written as sheet.html but is no longer pictured as sheet.png, which was too tall to read whole. `show --section <family> --png` takes any other family. The result names the family pictures first among the pictures to open.

@josephfarina
