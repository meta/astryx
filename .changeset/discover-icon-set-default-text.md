---
'@astryxdesign/cli': patch
---

[fix] `astryx discover <package>/<set>` names an icon set's default look by its variant in text (`default: outline`) instead of printing `[object Object]`. On that page and in `astryx experimental icon --list`, a default that names no variant no longer prints an empty `default:` line. The JSON is unchanged.

@josephfarina
