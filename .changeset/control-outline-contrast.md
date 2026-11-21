---
'@astryxdesign/core': patch
---

[fix] An unchecked radio, an unchecked checkbox and an off switch now show their outline at 3:1 against the surface (WCAG 1.4.11). The edge mixes the theme's emphasized border halfway to its secondary text color, so every theme keeps its own hue; the switch's off track gets the same edge as a 1px inset ring. Checked states and every other component are unchanged.

@josephfarina
