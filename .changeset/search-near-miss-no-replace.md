---
'@astryxdesign/cli': patch
---

[fix] `astryx search` reads a one-word identifier such as `BaseTable` as its words when the only match on the whole identifier is a near miss of a different name, so a typo-distance match no longer replaces every result the words would find. A near miss whose name spells every word of the identifier in order, one of them possibly slipped by one edit or two swapped letters (`useTableExpansion` and `useTableRowExpansion`, `ButtonGrop` and `ButtonGorup` for `ButtonGroup`), unless the slipped word is one the catalog already uses (`FieldStats` is now read as `field stats`), still answers alone.

@josephfarina
