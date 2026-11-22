---
'@astryxdesign/cli': patch
---

[fix] The theme editor's pictures name the same font for a theme's headings and body text every time: the font probe waits for the fonts its probe text names and lays the text out before it reads which font the browser drew. Before, a cold picture could read no font, so the "this machine has none of …" note came and went between runs of the same page.

@josephfarina
