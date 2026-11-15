---
'@astryxdesign/cli': patch
---

[feat] For an app whose theme its integration's provider wires, `astryx doctor` names the theme a stylesheet of the package belongs to: one in that theme's own folder, or one its stylesheet imports. `astryx theme list` says on each such theme's `wiredBy` line that the provider applies when the app renders it, and that `astryx doctor` checks where.

@josephfarina
