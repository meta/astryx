---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[fix] A theme's own `:hover` styles now apply only on a device that can hover (`@media (hover: hover)`), as Core's own hover styles do, so on a touch screen a tapped themed button no longer keeps its hover look. A theme's own `:active` styles, and the press state that takes their place under a coarse pointer, now skip disabled and `aria-disabled` controls, as a themed `:hover` already did, so a pressed `aria-disabled` button no longer shows the theme's press look. Specificity does not change. Theme builds from the CLI get the same output, since they use Core's compiler, and a family build (`astryx theme build --family`) still writes a rule its members share once, now also when the rule sits in a hover or pointer query.

@josephfarina
