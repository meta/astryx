---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set` gives a border color a line to show on: on a part that draws no border in the variant and state asked (a tab, a primary button, a banner), a border color, one color, one per side or one side's, also writes a transparent border at rest as wide as the theme's border width, so the part keeps one size in every state. The result names it, and one `undo` takes back both. Where the theme itself sets that border to none, the color is refused with the undo that clears it. `how` answers check and build their border colors the same way. The build keeps a state's own border colors after a border it repeats from the part's resting rule, so a selected tab's per-side colors are no longer reset.

@josephfarina
