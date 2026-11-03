---
'@astryxdesign/core': patch
---

[fix] A data-mode `DropdownMenu` that opens as a bottom sheet from a `renderTrigger` now titles the sheet, and names its dialog, after the menu's `aria-label`, else the trigger's own name, as its popover does. It no longer reads "Menu" for every such sheet. (#9525)
@HelloOjasMutreja
