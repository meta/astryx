---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`'s pictures and its `missed` list show what the theme draws:

- `--png` pictures show overlays drawn open as they look open: each opening animation runs to its end before the picture.
- A change that changes nothing counts the parts the theme still misses, as `show` lists them.
- A base theme's own rule for a state (butter's selected nav item, drawn with no fill) is what the contrast checks and `missed` judge.
- An inverted surface that disappears into the page (a toast, a tooltip) gets a line that makes it stand out again, in each mode it disappears in.
- A border line on a part whose variants differ (a button) frames only the variants that draw a box; the ghost button keeps none.
- With the theme's own corners at a pill, no pill part is listed as missed.
- `show`'s count line under `missed` says what the rest are: parts whose fill or text color is still the base's, and the other missed parts.

@josephfarina
