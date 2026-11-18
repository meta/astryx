---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a color for one mode on a part is written in the part's block for that mode.

- In the other mode the theme writes nothing there, so what Core and the base theme give the part in context stays as it was: the current page in Pagination, a text field's error, warning and success borders.
- A one-mode color in a state is accepted on a part that has no color of its own in that state; the other mode keeps Core's.
- A one-mode gradient goes into the part's block for that mode as its image layers (and a color layer as that mode's color), so the other mode keeps Core's own images, such as a button's hover tint.
- A one-mode background on an app shell region leaves the page background painting it in the other mode.
- A one-mode color in a state is accepted on every member of a group, and an exception kept in a state (inputs darker except when focused) keeps that state's own fill in each mode.
- The part data records a background a part inherits (`inherit`) as no paint of its own.
- The result lists each property a change writes inside a mode block, under its path (`@dark :hover`).

@josephfarina
