---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads more questions through its shared readers:

- **Lists:** a two-item list of variants or states before a single ask names each one for that ask: "primary and ghost buttons rounder", "hovered and pressed buttons orange", in an except list too. "except disabled buttons" keeps that state. An except covers the whole ask before it. A prohibition said before the ask ("never round the inputs; make everything rounder", "don't make cards rounder, make everything rounder") is read the same as one said after it.
- **One-mode shadows:**
  - A one-mode shadow on a part reads the shared shadows to their layers.
  - It refuses with the true reason when the other mode is unknown, or when nothing of the part's own is there to remove.
- **Ringed parts:** a resting shadow, or its removal, is not offered on a part that draws its hover and focus rings in its box-shadow, in either mode.
- **One-mode lines:** a line the part already draws (a border, one side of it, an outline) takes its color by mode. When `set --mode` refuses such a line, it now names working steps instead of ones that repaint the other mode.
- **Accent colors:** on a theme whose modes show a color in different hues, or that shows only dark mode, a lighter, darker, warmer or cooler accent moves each mode's colors from their own values.
- **Swaps:** swapping two role colors also swaps their text, icon, wash and label colors in every mode.
- **Corners:** comparisons read the radius each part is built with (stone's pill buttons). A button group's corners step by a px amount.
- **Gradients:** gradients named by theme colors ("from the accent to the danger color") use those colors.
- **Hyphens:** a part or phrase written with hyphens or underscores ("focus-ring", "table_row") reads the same as with spaces.
- **Other readings:**
  - A text-only part's color is its text color ("the top nav heading white").
  - "What color is the header" answers its fill.
  - "Bigger but no more than 20px" takes one step of the theme's scale, held to the bound.
  - "Everything serif except headings" keeps the headings' font.
  - "The hover tint stronger" changes the shared hover wash, not the page.
  - "The body text 1px bigger" steps the text size.

`box-shadow none` on a card now also removes Core's elevation shadow. The selection ring stays.

@josephfarina
