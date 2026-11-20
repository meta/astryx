---
'@astryxdesign/cli': patch
---

[experimental] The icon commands say what the icon-set guides say. Their help, receipts, `next` hints, errors and warnings call each entry of Astryx's shared list of what icons are for an "icon meaning" instead of an "icon definition", and a set's looks its "variants". `integration check` and Doctor list "Unmapped icon meanings (optional)", `add` and `map` no longer say they "register" an icon, and the hint with no set installed says "Find an icon set". A match's `reason` reads `meaning "close"` where it read `definition "close"`. Commands, flags, config keys, error codes, JSON fields and file names do not change.

@josephfarina
