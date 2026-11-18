---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a theme saved by a newer CLI now opens instead of failing, and opening it never changes how it looks.

- A palette recipe this CLI doesn't know: the saved palette and the settings module the newer CLI wrote are kept exactly as they are, and `show` builds the same CSS `theme build` makes of them. A note names the recipe. Changes that leave the colors alone, and their undo, work, and keep the shades the theme shows. A color change is refused, naming the recipe and this CLI's version, and gives the line that installs the newest CLI.
- A palette made with an older recipe this CLI knows is made again with its newest when the theme opens, and the result says so (its colors change once).
- A saved setting that this editor would refuse if typed in is kept and built as saved, with a note and the lines that clear it, instead of stopping the theme. This includes an `only` on a part property no group spreads to. A value the property cannot take still stops the theme.

@josephfarina
