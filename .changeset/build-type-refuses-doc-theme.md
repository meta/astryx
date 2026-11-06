---
'@astryxdesign/cli': patch
---

[fix] `astryx build --type` accepts component, hook and template. `--type doc` and `--type theme` now fail with an error that points to `astryx search <query> --type doc` or `--type theme`, instead of returning an empty kit: a build kit has no doc or theme group.

@josephfarina
