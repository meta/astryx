---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads per-side borders as said: colors written one per side (`#eee #eee #ddd`) are one `border-color` with every side as written; a border said on several sides ("a #ddd border on top and sides", "no border on the sides") is written on each side said, never only the first; a side said transparent ("with a transparent bottom") is that side's line drawn see-through, never a clear fill or a fainter border; and one side's border said after a part's border ("input border #ddd, bottom border #999") is that part's side, never the theme's border color.

@josephfarina
