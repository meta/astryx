---
'@astryxdesign/core': patch
---

[perf] Popover, DropdownMenu and its submenus, Selector, ComplexSelector, PowerSearch and Breadcrumbs' menu play their entrance on the surface inside the layer, not on the anchored layer. Chromium laid the anchored layer out again on every frame of its 150 ms entrance, two to four times per frame, whenever the page had other frame work. The entrance looks the same. `layerAnimations` is unchanged; its docs now say to apply it to the surface. Applied to the layer, it still plays as before.

@vjeux
