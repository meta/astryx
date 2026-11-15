---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview` reads each preview page once per element when it checks whether the page was changed by hand: a page whose JSX nests deep took time that doubled with each level, so `preview add` and `preview remove` were slow on the generated pages. The open states picture draws again every part of another part that opens a layer of its own (a dropdown's submenu and radio group, a tab list's overflow menu, a top bar's menu); only an overlay's own parts stay inside it.

@josephfarina
