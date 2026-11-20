---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set` gives a border color a line to show on: on a part that draws no border in the variant and state asked (a tab, a primary button, a banner), a border color, one color, one per side or one side's, also writes a transparent border at rest as wide as the theme's border width, so the part keeps one size in every state. The result says a border was added and how wide ("added a 1px border to tab so the color shows"), and one `undo` takes back both. The change also measures what the added width moves, every time: the part's boxes on the sheet before and after, at rest and in each state drawn ("badge grows by 2px in width", or that it keeps its size). Where the theme itself turns that whole border off (`border none`, `border-width 0`), the color is refused, naming the none, with the undo that clears it; a color after a none on one side or in a list of values (`border-width '0 0 1px'`) is saved as written, as before, and brings no border. A part the theme gives a border width or style of its own (`border-top-width 2px`) is left as it is: a color set there is saved as written, as before, with no border added and no note (so where that width has no drawing style, nothing shows, as before). `how` answers check and build their border colors the same way.

@josephfarina
