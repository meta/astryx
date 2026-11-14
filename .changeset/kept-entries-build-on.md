---
'@astryxdesign/cli': patch
---

[perf] A kept catalog entry now names the kept entries it builds on and stores only the file states they do not hold, so a run checks each file once instead of once per entry that read it. A warm `component`, `search` or `template` in a project with a large integration checks about 3,800 fewer files; output does not change.

@josephfarina
