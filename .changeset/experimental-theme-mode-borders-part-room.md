---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`:

- A border in one mode on a part that draws none is a ring at its edge (an inset box-shadow) that takes no room, so the other mode keeps its size; where the part draws a shadow of its own, the answer says why it cannot.
- Outlined buttons in one mode keep the outline dial beside the one-mode colors, and say the dial is the same in both modes.
- A divider's line is reached per variant: its color (the strong divider's own token), its thickness by the amount said, and its removal. A fill on the divider's own element, or a token its variant does not read, is refused with the line that reaches it.
- A token family follows a source written as one `light-dark()` value or a token reference.
- A variant's low-contrast text is listed once, with a fix scoped to that variant.
- A part's border is no longer colored through parts inside it that draw no line (a toast's ghost buttons); a part with no border made thicker takes its own height.
- A state shadow that keeps Core's ring keeps each status's own ring there.
- Pieces named after a part's catalog name ("the checkbox check", "the select arrow") are those parts.

@josephfarina
