---
'@astryxdesign/cli': patch
---

[fix] `astryx doctor integration validate` and `astryx integration check` name unreachable contribution metadata with forward slashes on every platform. On Windows the path in "Found contribution metadata ... outside every declared integration root" used backslashes, while the fix in the same message used forward slashes.

@prath47
