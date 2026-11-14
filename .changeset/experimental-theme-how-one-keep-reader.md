---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads each ask through its shared readers and holds every answer to what the theme shows.

- **Fills:** a fill of one color is written as `background-color`, so Core's hover and press tint stays.
- **Keeps and excepts:** one reader takes every way of keeping something as it is, in any position, and joins them into the ask's one except list. That covers "…, but keep cards as they are", "keep the dialogs as they are and …", "…, not the primary ones" and a second keep.
  - A button group cannot be kept apart from the buttons in it, and the answer says so.
  - A removed border kept when focused keeps its whole border.
  - The shared border width is kept as the token on the part.
- **Amounts and bounds:**
  - A decimal comma is a decimal ("1,5 times").
  - An amount with a bound is held to the bound ("8px more but at most 20px").
  - "Don't make X rounder than 8px" is that bound.
- **Removals:** "the X and Y of cards" stays on the cards, and "cards, buttons or inputs" names each part.
- **Asks with no change:** a swap is done exactly or not at all. A part and an aspect alone ("card corners") write nothing.
- **Modes:** "at night" and "night mode" are dark mode. A one-mode shadow on a part moves only that mode. A part that shows no shadow at rest takes a one-mode shadow. The `--mode` refusal for a shadow now says that its color can still differ by mode, through light-dark().
- **Colors and constraints:**
  - "Never use pure white" moves only what is pure white.
  - "With readable text" pairs a label that reads on the fill in each mode.
  - Vibrancy is measured on the accent wash too.
  - A typed color wins over a color word: a typed shadow color, and a typed color for text on the accent.
  - "A lighter purple" is that hue's light shade.
- **Named dial rungs:** "make corners small", "spacing compact" and "text size large" are those rungs.
- **Comparisons and measured values:**
  - "4px less round than buttons" is answered.
  - A value Core writes from several tokens (a card's padding) is measured whole.
  - A px amount on a part starts from the radius the part is built with.
  - Variant pairs need two real variants.
- **No editor theme yet:** `how` starts from, and measures against, the theme the app shows now.

@josephfarina
