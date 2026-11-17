---
'@astryxdesign/cli': patch
---

[feat] `astryx component <Name> --props` now shows the types its props name. After the props list, a Types block gives one `import type` line and the declaration of each type the owner package exports, then of the types those types name. For example, Typeahead's `searchSource` shows `SearchSource`, `SearchableItem` and `SearchContext`. With `--json`, each such prop carries `types: [{name, declaration?}]`.
