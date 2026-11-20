---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` holds its answers to what the theme shows now:

- a bound already passed the way the words ask ("input borders thinner but at least 2px" at 1px, "the corners rounder but at most 4px", "borders thicker but no more than 0px", "the text bigger but no bigger than 12px", "the line height bigger but at most 1.2", "card padding smaller but no less than 64px") changes nothing and says so, never moving the value the other way; a part's border width is read from the token its border reads, and a way beside a bound on a length the part does not have ("cards wider but at most 300px") writes nothing;
- "headings tighter" is the headings dial's letter spacing, one rung from where it is, and "but no tighter than -0.01em" holds it there instead of changing the whole theme's spacing;
- "buttons 4px taller" reads the part's height, and "8px wider" its inline padding, half on each side;
- "selected rows lighter" steps the token Core paints a selected row with, in the mode named;
- "the header the same color as the sidebar" takes the page color a part with no fill of its own shows;
- "more colorful" and "less saturated" on a one-mode theme answer with the first vibrancy that moves the accents it shows the way asked;
- a value question on a one-mode theme tells the mode it shows, and says a mode it never shows has no value;
- "the accent color but lighter", "the danger color but darker" (with or without a comma before "but") make that color lighter or darker in each mode on a fill or a border, as on text;
- "the sidebar the page color but darker", "the header the card color but darker": the color of the part named after another is read and stepped, never changed itself.

@josephfarina
