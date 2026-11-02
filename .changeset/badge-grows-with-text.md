---
'@astryxdesign/core': patch
---

[fix] Badge: a badge with a label is now never shorter than one line of that label. With a larger text size, a badge's label grew while the badge kept its fixed height, so the label spilled out of the pill and white text on a colored badge became unreadable. The badge now grows with its label. At the default size nothing changes, a theme that sets the badge's height keeps that height there while its badges still grow with larger text, a color-only badge keeps its size at every text size, and a badge still shrinks and truncates in a container too narrow for it.

@vjeux
