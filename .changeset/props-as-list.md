---
'@astryxdesign/cli': patch
---

[feat] `astryx component <Name>` (and its `--props` view) lists props one per line, ``- `name`: `type` = `default` - description``, with the required and experimental markers after the type, instead of a four-column table. Union types keep their pipes as written, and no field is dropped; `--json` is unchanged.

@josephfarina
