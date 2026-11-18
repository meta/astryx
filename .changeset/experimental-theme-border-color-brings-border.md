---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set` gives a border color a line to show on: on a part that draws no border in the variant and state asked (a tab, a primary button, a banner), a border color, one color, one per side or one side's, also writes a transparent border at rest as wide as the theme's border width, so the part keeps one size in every state. The result says a border was added and how wide ("added a 1px border to tab so the color shows"), and one `undo` takes back both. The change also measures what the added width moves, every time: the part's boxes on the sheet before and after, at rest and in each state drawn ("badge grows by 2px in width", or that it keeps its size). Where the theme itself sets that border to none, the color is refused with the undo that clears it. `how` answers check and build their border colors the same way.

@josephfarina
