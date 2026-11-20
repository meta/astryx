---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: the overlays a page opens are drawn one part at a time, so a part's document listeners (a typeahead's or a menu's outside press) hear only presses on its own controls. Every editor command that reads the part data, and every sheet picture, no longer pays for each press on every other part. The part data is the same as before.

@josephfarina
