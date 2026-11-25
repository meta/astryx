---
'@astryxdesign/core': patch
---

[fix] A trigger click that closes a DropdownMenu now calls onOpenChange(false) once (architecture:react-component-runtime INV2, INV3). Synchronizing a controlled close when isMenuOpen turns false suppresses redundant notifications, so a parent closing the menu no longer receives onOpenChange(false).
@rheatkhs
