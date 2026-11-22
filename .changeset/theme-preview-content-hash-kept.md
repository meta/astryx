---
'@astryxdesign/cli': patch
---

[perf] The theme editor's previews keep the hashes of the last 64 file texts they hashed in one process, so a command that hashes the same page twice, and repeated previews through `@astryxdesign/cli/api/experimental` in one process, are faster. Every recorded hash and every preview answer is unchanged.

@josephfarina
