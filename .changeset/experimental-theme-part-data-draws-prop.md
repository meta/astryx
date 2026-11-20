---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`:

- The part data draws every prop that changes a part's look (a toast's type, an avatar's shape), and reads a prop as a condition where it changes a color the part paints, so "the error toast background darker" steps from the error toast's own red.
- A part kept from a corner change pins every corner token its shapes read.
- A select's chevron or caret is its indicator icon, and a piece a part does not have (a date picker's segments) is named; neither writes the whole part.
- "indeterminate checkboxes red" reaches indeterminate boxes only, and "selected" is a toggle button's pressed state.
- A part that draws a line on some sides only (a grouped button's join) is still listed as drawing no border of its own.
- A one-mode hover shadow on inputs keeps their hover ring; "half as visible" is the input ring's alpha; "all focus rings" colors the inputs' rings too; a one-mode border on a part with no line draws one, see-through in the other mode; a radio's dot is its own part; "the progress indicator" is the progress bar's, and a state it does not draw apart (indeterminate) is named.

@josephfarina
