---
'@astryxdesign/cli': patch
---

[fix] The CLI orders names the same way on every machine. Build, search, discovery and the CLI's lists (such as `astryx component --list`) broke ties with the host's locale, so a machine set to another language could pick a different template or print lists in a different order. They now use one fixed text order, and a lint rule keeps locale-dependent comparisons out of the CLI.

@josephfarina
