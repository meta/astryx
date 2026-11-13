---
'@astryxdesign/cli': patch
---

[perf] The published CLI reads the icon definitions and built-in theme descriptors it ships from values stored at publish instead of parsing each file, so `docs` answers about 45 ms sooner and `doctor` and `theme list` about 10 ms sooner. An edited or unknown descriptor is parsed as before. Output is unchanged.

@josephfarina
