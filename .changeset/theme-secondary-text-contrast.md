---
'@astryxdesign/theme-matcha': patch
'@astryxdesign/theme-y2k': patch
'@astryxdesign/theme-butter': patch
'@astryxdesign/cli': patch
---

[fix] Matcha: light-mode secondary text is slightly darker (Neutral Light 30), so it meets 4.5:1 on the body (5.11:1, was 3.83:1), the surface and the card.
[fix] Y2K: light-mode secondary text is slightly darker (Neutral Light 35), so it meets 4.5:1 on the Periwinkle body (5.14:1, was 4.25:1).
[fix] Butter: in dark mode, an unselected SegmentedControl label is slightly lighter (Neutral Dark 75), so it meets 4.5:1 on the track over a card (5.56:1, was 4.47:1).
The CLI's Matcha, Y2K and Butter theme templates match.

@cixzhang
