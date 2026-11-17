---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`:

- "avatars: round, 32px" now gives round avatars that are 32px wide and tall. Before, it read 32px as the corner radius and dropped the size.
- "error text #b91c1c" now sets the error text color token, as "success text …" and "warning text …" already did. "warning text …", "info text …" and "danger text …" without a color now reach their text colors too, instead of reporting a missing part.
- A status text made darker "for contrast" (or to be easier to read) now gains contrast in both modes: darker in light mode, lighter in dark mode.
- "tooltips: #f5eff7 12px text" now sets both the text color and the size. "menus 14px text" now sets the menu's type sizes instead of being refused.

@josephfarina
