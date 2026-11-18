---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` sizes checkboxes and radios: "smaller checkboxes", "bigger radios" and "smaller checks" answer with the box's width and height one 4px step at each size, from that size's own value (the theme's latest setting on the box or its group, else the size Core draws); a size whose value the editor does not know keeps its own size and the answer names it. Before, these asks answered with spacing, which a checkbox's box does not read, so nothing could be run. `set <theme> spacing less --on checks` is refused with the box's size, the theme's first, and the `how` line that sizes it. A doc that lists a part with no values for a visual prop now takes them from another doc that lists the same part, so the checkbox box takes `--when size:sm`.

@josephfarina
