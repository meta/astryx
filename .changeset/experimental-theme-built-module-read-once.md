---
'@astryxdesign/cli': patch
---

[experimental] Theme editor: a change (set, undo) parses the built theme once instead of once for every part and scope it checks, so changes on a theme that styles many parts run faster. The file is still read on every check.

@josephfarina
