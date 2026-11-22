---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how "glossy buttons"` makes a gloss from each look's own fill instead of the one white-to-indigo sample gradient it wrote on every part named: a lighter top and a darker bottom around the fill. Where the fill is an opaque theme token (a button's accent, a header's surface), the gloss is a live gradient over that token with `color-mix()`, so it follows whatever the theme or the same answer sets it to, in both modes; a see-through fill is glossed in each mode at its own alpha, carried by the gloss alone, and a color said in the ask, or a literal fill the theme saved, is glossed as colors from the palette's tone scale. Each look along the axis the part's fills vary by (a button's variant, a toast's type) is glossed from its own fill. Where the part draws the hover and pressed overlays, they are kept, layered over the gloss. A look that draws no fill, a gradient the theme set, a part whose hover and press tint its own fill (a switch's track), and a part whose looks draw colors the editor does not read (a banner's statuses) write nothing, and the answer says why.

@josephfarina
