---
'@astryxdesign/core': patch
---

[feat] An anchored layer's entrance now slides from, and scales about, the side the layer lands on. Before, a layer that flipped because its requested side had no room still slid from that requested side, onto its trigger. The entrance also scales about the point where the layer meets its trigger, not the center of its box. A Selector list that opens over its selected item scales about the trigger's center and does not slide. This applies to Popover, DropdownMenu and its submenus, ContextMenu, Selector, ComplexSelector, Tooltip, HoverCard, Breadcrumbs and PowerSearch menus, and any layer that uses the shared entrance. Built-in layers have no option that keeps the old entrance. The public `layerAnimations` styles now also set `transform-origin`; a caller's own `transformOrigin` listed after them still wins.

@vjeux
