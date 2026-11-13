---
'@astryxdesign/cli': patch
---

[perf] A warm `doctor` checks each file its three kept docs checks read once instead of once per check (they read mostly the same files), so it answers sooner, more so in projects with large integrations. Output is unchanged.

@josephfarina
