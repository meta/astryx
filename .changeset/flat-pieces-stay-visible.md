---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set <theme> surfaces flat` keeps its tinted panels, and the gray pieces inside a panel drawn in the tint's color (a neutral badge, a progress or switch track) are drawn in the panel's own surface there instead, so they stay visible; colored fills keep their hue, and the emphasized border is stepped inside the panel where it would stand out less from the tint than from the panel's surface.

@josephfarina
