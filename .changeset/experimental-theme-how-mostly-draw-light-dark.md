---
'@astryxdesign/cli': patch
---

[experimental] Fixes in `astryx experimental theme editor how`, mostly for themes that draw both light and dark modes:

- **Page color words:** a page color given as a word ("make it gray", "make the page pink") becomes that color at each mode's own page lightness. Before, one mid-tone page was used for both modes, under text that could not be read on it.
- **Borders:** a light border on a part keeps that part's own dark-mode border color (an input's emphasized border), instead of the theme's faint line.
- **Unchecked and unselected:**
  - "when off", "unchecked" and "unselected" keep the checked or selected look as it draws (a switch's accent), instead of writing the off look back onto it.
  - If the ask says the selected look itself ("selected tab text white, unselected tabs gray"), each look is written as said.
- **Reading the ask:**
  - The color a complaint names ("the pink page background is a bit much, …") is how the part looks now, never a value.
  - "X instead of outlined" takes that part's own outline away, never every border.
  - "table header row" means the header cells.
  - A ban on black text after a page clause is about the text.
  - A state with a value ("primary hover #4338ca") no longer passes its state to the next clause.
  - A token list item said subject first ("text #111827") is the theme's.
- **Button variants:** when a fill like "navy buttons" goes to some button variants only, the destructive button keeps its red, and the answer says so.
- **Color words for dark mode:** only a color word the ask actually says ("subtle gray in dark mode") is swapped for its dark tone. A color computed from a direction ("make the card background darker") is never swapped.
- **Links:** a link color under 2.5:1 on one mode's page is set for the other mode only ("dark red links").

@josephfarina
