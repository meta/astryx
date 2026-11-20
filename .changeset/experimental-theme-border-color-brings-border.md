---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set` gives a border color a line to show on: on a part that draws no border in the variant and state asked (a tab, a primary button, a banner), a border color, one color, one per side or one side's, also writes a transparent border at rest as wide as the theme's border width, so the part keeps one size in every state. The result says a border was added and how wide ("added a 1px border to tab so the color shows"), and one `undo` takes back both. The change also measures what the added width moves, every time: the part's boxes on the sheet before and after, at rest and in each state drawn ("badge grows by 2px in width", or that it keeps its size). Where the theme itself turns off every side the color is on, read in the order its settings are written (`border none`, `border-width '0 0 1px'` for a top color, `border-block-width '0 1px'`, `border-bottom none` for a bottom color), the color is refused, naming the none, with the undo that clears it; a color with a side that still draws is saved as written, with no border brought, and undoing the none brings the border it needs. `how` answers check and build their border colors the same way.

@josephfarina
