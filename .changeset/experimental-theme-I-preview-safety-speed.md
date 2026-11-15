---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview` reads each preview page once per element when it checks whether the page was changed by hand: a page whose JSX nests deep took time that doubled with each level, so `preview add` and `preview remove` were slow on the generated pages.

@josephfarina
