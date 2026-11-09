---
'@astryxdesign/theme-butter': patch
'@astryxdesign/theme-stone': patch
'@astryxdesign/theme-y2k': patch
'@astryxdesign/cli': patch
---

[fix] The Butter, Stone and Y2K themes set supporting text (`--text-supporting-size`) in rem instead of a fixed 12px, so it grows when a reader raises the browser's default font size, like the rest of the text. At the default size it is still 12px. The CLI's copies of these themes match.

@cixzhang
