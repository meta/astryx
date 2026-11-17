---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`:

- `how` colors a table's row lines ("table row dividers red", "table borders red") through the color its cells draw them with, set on the row; never the Divider part, a row fill or a border over the cells.
- "outline buttons" is the buttons dial's outline; one variant outlined ("the danger buttons outline only") clears its fill and takes its own color as its border and text.
- A keep that needs two states at once ("the switch red when on except when disabled") says so.
- An input's focus ring asked per mode is one ring for both halves of a mode pair, and a layer per mode for a width in one mode, so the other mode is unchanged; a status named with the inputs ("error inputs") is that status's ring; "50% more transparent" is the ring color's alpha; a question about the ring writes nothing.
- A hover or press shadow on inputs keeps the focus ring while the field is focused.

@josephfarina
