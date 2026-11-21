---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how "glossy buttons"` makes a gloss from each look's own fill instead of writing nothing: a lighter top and a darker bottom around the fill. Where the fill is a theme token (a button's accent, a header's surface), the gloss is a live gradient over that token with `color-mix()`, so it follows whatever the theme or the same answer sets it to, in both modes; a color said in the ask, or a literal fill the theme saved, is glossed as colors from the palette's tone scale. Each look along the axis the part's fills vary by (a button's variant, a toast's type) is glossed from its own fill, a see-through fill at its own alpha, and a state the part fills on its own (a switch's checked track) from that state's fill. A part's hover and pressed washes are kept, layered over the gloss. A look that draws no fill, a gradient the theme set, and a part whose looks draw colors the editor does not read (a banner's statuses) write nothing, and the answer says why.

@josephfarina
