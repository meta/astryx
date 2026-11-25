---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a text or icon token set on a bar (white text on the app's header or its top nav) also reaches the menus and popovers its items open, because Core draws a layer inside the element that opens it. The check now measures that token on the popover fill and reports it below 4.5:1, with the fix on the overlays (`set <theme> --color-text-primary '#000000' --on overlays`). Before, the check measured only what is drawn inside the bar, so a white-text header gave its menus white items on a white panel with no problem reported.

@josephfarina
