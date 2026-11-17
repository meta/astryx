---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` sizes checkboxes and radios: "smaller checkboxes", "bigger radios" and "smaller checks" answer with the box's width and height one 4px step from its size now (the theme's own size, else the size Core draws), and "13px checkboxes" with both at 13px; the check, the dash and the dot are drawn as a share of the box. Before, these asks answered with spacing, which a checkbox's box does not read, so nothing could be run. `set <theme> spacing less --on checks` is refused with the box's size and the `how` line that sizes it.

@josephfarina
