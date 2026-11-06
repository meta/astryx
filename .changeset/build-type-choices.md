---
'@astryxdesign/cli': patch
---

[docs] `astryx build --type` takes component, hook and template. `doc` and `theme` are deprecated: a kit has no doc or theme group, so they return an empty kit, and build now prints a hint to use `astryx search <query> --type doc` or `--type theme` instead. The next minor release refuses them. The help text, the CLI choices, the API doc and the invalid-type error name the same values.

@josephfarina
