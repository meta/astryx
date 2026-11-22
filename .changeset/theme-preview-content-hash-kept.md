---
'@astryxdesign/cli': patch
---

[perf] The theme editor's previews work out each file's hash once for each text in one process, so repeat previews in a hosted editor, and a command that hashes the same page twice, are faster. Every recorded hash and every preview answer is unchanged.

@josephfarina
