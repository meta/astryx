---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`:

- `show` and `set` count the missed list as misses on parts (a part can miss two ways, its border and its shadow), and `show`'s line under the six it lists counts the rest as misses, apart from the parts whose fill or text color is only still the base's. The JSON of a change adds `missedParts`.
- The sheet, the preview and the pictures draw an auto media surface inside a part with a fill of its own (a toast with a light background) on the side the app's measurement picks, so its text reads as it does in the app.
- Text drawn in a disabled color (an inactive segment) is held to no 4.5:1 contrast, and no fix whitens it.
- `set`'s note on a border width offers the frames `show`'s missed list has: only parts that draw a box, scoped to the variants that do, and none at a width of zero.

@josephfarina
