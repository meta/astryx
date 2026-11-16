---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: repairs follow the readers `set` already uses.

- A saved property name with a space or capitals (`"background color"`) is repaired by `set` in place: the line replaces the broken entry, and the theme loads again.
- A unit typed after a space joins its number for every CSS unit (`50 %`, `50 vw`, `200 ms`, `1,5 rem`), not only px, rem and em.
- A typo in `--when` (`variant:primray`, `siez:lg`) offers the same command with `--when` corrected. A saved one gets the undo, then that line, so the setting is kept.
- `undo <thing> <value>` with no `--mode` is refused when the setting is saved for one mode with another value, and names the saved value and its mode.
- `new --font 'Inter 600'` offers `--font Inter --headings semibold`, as `set` reads the same value.
- A saved entry that names its thing under `setting`, a saved entry with the setting and value the other way round, and a saved mode of `"both"` or `""` are read as `set` reads them typed, with a note, so the theme loads.

@josephfarina
