---
'@astryxdesign/cli': patch
'@astryxdesign/core': patch
'@astryxdesign/theme-neutral': patch
'@astryxdesign/theme-butter': patch
'@astryxdesign/theme-y2k': patch
---

[fix] Secondary text on the accent tint reads at 4.5:1, at rest and hovered, on the page and in every card, in every official theme: a selected list item, tree row, table row and command, a checked checkbox row, a numbered citation, and a dropzone's hint while a file is dragged over it. Core measures that text from the theme's own colours, the least change to the theme's secondary text that reads on the tint and its hover, and measures it again inside each card variant. Before, a selected table row's supporting text read 3.47:1 in dark Neutral and 3.50:1 in dark Butter (2.85:1 hovered on a surface), and a hovered selected row in Chocolate's orange card read 3.97:1. Neutral, Butter and Y2K drop their own per-part rules for this text, in their packages and in the copies the CLI bundles.

@josephfarina
