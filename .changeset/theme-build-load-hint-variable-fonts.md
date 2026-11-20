---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build`: the import hint is given only for a load failure that is an unresolved import, and `@fontsource-variable/<name>` is read as loading `<Name> Variable`, the family that package declares, not `<Name>`.

@josephfarina
