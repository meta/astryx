---
'@astryxdesign/core': patch
---

[fix] A data-mode `DropdownMenu` with `renderTrigger` that opens as a bottom sheet now titles the sheet, and names its dialog, the way the popover menu is named: the menu's `aria-label` when given, else the custom trigger's own name. It no longer shows the default "Menu". (#9525) @cixzhang @duytbp
