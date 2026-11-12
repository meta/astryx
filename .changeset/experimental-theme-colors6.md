---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: values the browser would drop are refused, and type and font settings do what they say.

- An installed `@fontsource/<font>` package always loads the font it names.
- Math inside `calc()` and the other math functions must be sound (`calc(1px banana)` is refused).
- A duration or easing token takes one value, never a list.
- A line height of `0` is accepted.
- An exact `--color-text-secondary` reaches the parts that lift secondary text, with or without a color dial.
- A font for the body alone keeps the headings' font.
- After `font <x> --on body`, later commands keep working.
- `more` or `less` past the last text-size step is refused, instead of going the other way.
- A dial whose tokens an exact setting holds says so.
- A token only the base theme's part styles read is no longer called unused.

@josephfarina
