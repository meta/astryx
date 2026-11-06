---
'@astryxdesign/theme-butter': patch
'@astryxdesign/theme-stone': patch
'@astryxdesign/theme-y2k': patch
'@astryxdesign/cli': patch
---

[fix] The Butter, Stone and Y2K themes set supporting text (`--text-supporting-size`) in rem instead of a fixed 12px, so it grows with a larger browser text size, zoom or Android font scale like the rest of the text. At the default size it is still 12px. The CLI's copies of these themes match.

@cixzhang
