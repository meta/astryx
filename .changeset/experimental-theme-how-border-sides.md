---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads per-side borders as said: colors written one per side (`#eee #eee #ddd`, or color functions) are one `border-color` with every side as written, for the light mode only when any side is light, as one light border is; a border said on several sides ("a #ddd border on top and sides", "on top, left and right", "only a top and bottom border", "no border on the sides") is written on each side said, never only the first; a side said transparent ("with a transparent bottom", "a transparent bottom border") is that side's line drawn see-through, never a clear fill, while "slightly transparent" stays a fainter border and "on top of" stays a place; and one side's border said after a part's border ("input border #ddd, bottom border #999") is that part's side, never the theme's border color. Each of these answers says what it read ("read \"transparent\" as that side's line").

@josephfarina
