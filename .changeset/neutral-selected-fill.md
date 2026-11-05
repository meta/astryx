---
'@astryxdesign/theme-neutral': patch
'@astryxdesign/cli': patch
---

[fix] Under the Neutral theme, a selected row, a calendar range and the other selected fills on Neutral's surfaces are visible again, and highlighted code lines are stronger. `--color-accent-muted` matched the surface in dark mode and barely differed from the hover tint in light mode; it is now `#d4d4d4` in light and `#474747` in dark. In dark mode a selected Item, TreeListItem or checked CheckboxListItem row, a numbered Citation and a FileInput dropzone lift their secondary text so it stays readable on the fill; a dropzone's hint is slightly lighter at rest too. Neutral's code comments, operators and punctuation are slightly less muted so they stay readable on a highlighted line. The CLI's Neutral theme template carries the same values.

@cixzhang
