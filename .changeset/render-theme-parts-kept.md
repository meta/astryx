---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export` keeps a theme's rules for the parts a component draws only after the first paint, such as a Banner's icon, a tab's indicator or a dialog. Core builds those parts' class names while the page runs, so the cut now also keeps, for each name in the page's script, the class Core's naming module makes from it. Before, those parts lost their theme styles in the rendered file.

@josephfarina
