---
'@astryxdesign/cli': patch
---

[perf] A kept value from an exact codec is stored as the JSON text its exactness check already read, so storing it no longer writes, parses and compares the value a second time. A run that keeps template discovery stores it about 15 ms sooner. A value that does not read back exactly is still never kept. Output does not change.

@josephfarina
