---
'@astryxdesign/cli': patch
---

[fix] The CLI's semver range check reads `^0` as any 0.x.y and `^0.0` as any 0.0.y, and reads a hyphen range (`1.0.0 - 2.0.0`) as inclusive bounds. Before, `^0` and `^0.0` were locked to a single patch version and a hyphen range could never match, so `astryx doctor` and the peer-version checks reported a false mismatch for projects that declare those ranges.

@thecodebasedot
