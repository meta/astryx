---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export`: an exported page's script reads from the first paint an image the first paint shows through `src`, `srcset` or `poster` when the page's code names it as a whole string by that exact path or https address. The file holds each such image one time fewer: a page with one 450 KB local photo goes from about 2.05 MB to 1.45 MB, and an https image the page shows through `src`, `srcset` or `poster` is held once (the same photo by an https address: about 1.46 MB to 0.86 MB). The first paint is the same, also where scripts are blocked.

@josephfarina
