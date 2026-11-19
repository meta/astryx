---
'@astryxdesign/cli': patch
---

[fix] The stored docs routes, and so the build id, are the same on every machine that packs the same files. How the machine's Node resolves module imports no longer changes which folders the stored routes list.

@josephfarina
