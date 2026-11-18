---
'@astryxdesign/theme-butter': patch
'@astryxdesign/theme-y2k': patch
'@astryxdesign/theme-gothic': patch
---

[fix] A plain table's rows keep the text colour around them in Butter, Y2K and Gothic; only a striped table's even rows take the stripe's text. Inside a coloured card in dark mode, every second row of a plain table read white on the pastel card, at about 1.2:1. Those themes' striped-row rule now reads the row's `striped` state.

@josephfarina
