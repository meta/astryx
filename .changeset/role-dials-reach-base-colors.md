---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a role color the theme sets (accent, success, warning, danger, info) now reaches the parts where the base theme draws that role on its own: a variant named for the role in a color of the base's palette written out (a success badge or progress fill), a role token the base points at another color on a part (a success banner), and a color the base gives a part as its own accent written as the color itself (nav links, outline buttons). Those parts take the theme's color, the missed list no longer lists them, and a color the theme sets on the part itself stays.

@josephfarina
