---
'@astryxdesign/core': patch
---

[fix] A toast's card draws on the right side from the first paint on a system-mode page. Before a script ran, a reader in dark mode saw the info toast with light text on its light card (about 1.1:1). The toast now renders its light-page side and names its dark-page side beside it, and the theme draws that side on a dark page. Themes whose toast surfaces keep one side in both modes write no extra CSS.

@josephfarina
