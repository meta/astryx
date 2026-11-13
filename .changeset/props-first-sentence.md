---
'@astryxdesign/cli': patch
---

[feat] `astryx component <Name>` prints the first sentence of each prop's description, with one line saying that `astryx component <Name> --props` prints them whole. Sub-components and integration component reads through `astryx discover <package>/<Component>` do the same. The `--props` view and `--json` keep every description whole.

@josephfarina
