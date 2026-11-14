---
'@astryxdesign/cli': patch
---

[fix] `astryx build` reads a request that opens with "add" ("add a filter row above the table") as a change to a page the builder already has, so it starts from the app shell. "Add a settings page" and "add a new dashboard" still start from a page template.

@josephfarina
