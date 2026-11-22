---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental icon add --definition` and `--new-definition` are now `--meaning` and `--new-meaning`. The old options have no alias: each is an unknown option. JSON keys and shape do not change; suggested commands and error text name the new options. The `iconAdd()` options (`definition`, `newDefinition`) and the files the command writes do not change.

@josephfarina
