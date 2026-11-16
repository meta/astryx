---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: one reader for each kind of input, on every path.

- A family list reads each family from its end, on the font dial, a family token and a part's `font-family`: a size, a weight or a style after a family's name (`Inter 16px`, `Inter Italic`) is refused with the family and the size's, weight's or style's own line; a bare number in a list (`Lato, 16`) is a weight only as a whole hundred; a misspelled generic (`sansserif`, `serf`, `system ui`) or, on the font dial, preset (`sytem`) is offered as that name, never saved as a family. A family the editor knows keeps its last word (`Source Sans 3`, `Arial Black 900` is Arial Black and a weight).
- A swapped setting and value is offered only when set takes it as typed, with the scope typed, never a sample command on a part nobody named.
- A property written with `_` or spaces (`font_size`, `"border radius"`) reads as the property, as camel case does, and gets the same answer.
- One yes/no reader for a flag given a value and a saved `only`: the documented spellings of yes and no, or a typo of one; any other word is refused with no line guessing it. The line offered is checked as every repair is.
- `--mode` reads a word that names one mode (`dark-only`, `darkmode`, `dark mode`) as that mode, in set and undo alike.
- A pasted object of one entry gets that entry's repair.
- A saved value that set repairs (`headings "blod"`, `spacing "romy"`, `text-size "16px"`) is offered that repair beside the undo.
- A damaged base or mode is offered the lines that set it again (each installed base, each mode), never a default that drops it; a base written with `theme` (`neutral-theme`) is that base.

@josephfarina
