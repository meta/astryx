---
'@astryxdesign/cli': patch
---

[experimental] The pictures an agent opens show the overlays, and the output keeps what was missed where a cut output still shows it:

- `preview.png` (the sample page) ends with a strip of a tooltip, a popover, a menu and a select list drawn open, from the overlays the sheet draws.
- `sheet-overlays.png` shows the small overlays first, about five to a row, a panel over the page cropped to its top, and no part of an overlay alone.
- A change without `--png` names `show --png` and the two pictures it writes to open.
- A change counts, near its top, the parts the theme's changes did not reach; `show` lists them, with their lines, last before its closing look line.

@josephfarina
