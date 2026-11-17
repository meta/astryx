---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: the cached part data is keyed by a fingerprint of the code that builds it (the census source and every file it imports), beside the installed Core, so any change to that code builds it again; there is no version number to bump by hand.

@josephfarina
