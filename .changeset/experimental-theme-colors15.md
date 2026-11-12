---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: more refusals and notes that are true.

- A negative percentage the current CSS grammar ranges at 0 or more is refused on a part (`line-height -50%`, `gap -10%`).
- A `color-mix()` share may be written as any CSS percentage (`5e1%`, `+50%`, `calc(50%)`).
- Line-height tokens (`--text-*-leading`) take a number with no unit, as Core multiplies them by a text size; `1.5em` and `150%` suggest `1.5`.
- `headings` in other letters or as a weight number suggests the word meant (`BOLD` is bold), and a weight number the nearest weight rung (`800` and `900` are heavy), never a lighter one.
- A whole-theme font under fonts set for body and headings says which role fonts it sits under and how to clear them.
- A font one of the editor's own presets leads with (Comic Sans MS) gets no "must load" note.
- `text-size more` or `less` at the end of the dial's range suggests the base font size token, never a size the dial refuses.
- A CSS font value on a part made of keywords (`italic bold`, `bold 1rem`) is split into its longhands, never a family; after the size, the rest is the family, as CSS reads it (`1rem bold` is size 1rem with the family bold).

@josephfarina
