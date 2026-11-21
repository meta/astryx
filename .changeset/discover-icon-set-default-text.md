---
'@astryxdesign/cli': patch
---

[fix] `astryx discover <package>/<set>` names an icon set's default look by its variant in text (`default: outline`) instead of printing `[object Object]`, and leaves the line out when the default names no variant. `astryx experimental icon --list` no longer prints an empty `default:` line for such a default. The JSON is unchanged.

@josephfarina
