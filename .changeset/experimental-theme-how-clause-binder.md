---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` now binds each clause of a long ask to its own part:

- A part word in a clause wins over a part carried from before.
- A part said in one clause reaches a clause that names none of its own only when that clause comes right after it. A part a list is led by reaches all of the list's items, until another part is said. A part carried once is carried no further.
- A look out of that reach, with no theme word and no dial of its own, is named in its own words, never written on a part said further back or on the whole theme.
- A mode pair stays on one part: "borders #d5dbe1 in light mode and #30313d in dark mode" in an inputs list writes both halves on the inputs.
- A bare color said of a part that paints no fill of its own (a tab, a side nav item at rest), in an ask that speaks of that part's text elsewhere, is its text color: "tabs 14px text, …, other tabs #666666".
- "#f7f8f8 text on #1c1d1f" after a part keeps the text on that part, in its state.
- Items said with a subject that names no part ("kbd hints … with … text and 4px corners") are held with it and written nowhere.
- A color said of a part that fills when checked (a switch, a checkbox, a radio) is its checked fill, in a list of parts too, so off switches and unchecked boxes keep their look: "switches, checkboxes, progress bars and tab underlines in magenta".
- A list's rows are its head part's own items: "menus with 4px padding and 32px rows".

@josephfarina
