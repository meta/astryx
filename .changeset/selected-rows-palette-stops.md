---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
'@astryxdesign/theme-neutral': patch
'@astryxdesign/theme-butter': patch
'@astryxdesign/theme-y2k': patch
---

[fix] A selected table row and a selected command take the theme's own secondary text on the accent tint, as selected items and tree rows do. In Neutral, Butter and Y2K this text is a stop of the theme's palette that reads at 4.5:1 on the tint, at rest and under a hover, on the page and the surface and, for selected rows, commands and numbered citations, in every card. Every second row of a striped table in Butter and Y2K still takes the stripe's own text. Before, a selected table row's supporting text read 3.47:1 in dark Neutral and 3.50:1 in dark Butter. Butter's light stop moves from 40 to 35 and Y2K's dark stop from 70 to 75, so the text also reads under a hover in a muted card. Palette-made themes lift the same two parts.

@josephfarina
