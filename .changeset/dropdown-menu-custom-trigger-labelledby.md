---
'@astryxdesign/core': patch
---

[fix] Ensure DropdownMenu computes accessible name when a custom trigger is named via aria-labelledby. The menu points directly at the trigger's label targets, avoiding recursive aria-labelledby lookups prohibited by AccName.
@rheatkhs
