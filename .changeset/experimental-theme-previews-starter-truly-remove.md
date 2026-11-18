---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview` and the starter offer lines that work and name what is in the way:

- `preview remove` with no preview yet offers `preview add` only where add can work; elsewhere (an app with no root layout) it offers what add itself offers there.
- `preview app --theme` refuses, before anything is written, a theme whose import without its extension (`./helpers`) loads a link inside the theme folder, and one whose `url()` names no file (a wrong-case path); a folder in the theme folder it cannot read is named as a read, not a write.
- A named pipe or a device at `sheet.html` or `preview.html` is left as it is and named, as at the open states page's name, never written over.
- `preview app --theme` given a theme as a path or a list offers `preview app <folder> --theme <theme>`, never a look at the theme.

@josephfarina
