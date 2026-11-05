---
'@astryxdesign/theme-neutral': patch
---

[fix] Under the Neutral theme, a selected row, a calendar range and the other selected fills on Neutral's surfaces are visible again, and highlighted code lines are stronger. `--color-accent-muted` matched the surface in dark mode and barely differed from the hover tint in light mode; it is now `#d4d4d4` in light and `#474747` in dark. Text on the fill stays readable: a selected Item or TreeListItem row lifts its secondary text in dark mode, and Neutral's code comments, operators and punctuation are slightly less muted so they stay readable on a highlighted line.

@cixzhang
