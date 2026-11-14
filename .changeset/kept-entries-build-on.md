---
'@astryxdesign/cli': patch
---

[perf] A kept catalog entry now names the kept entries it builds on and stores only the file states they do not hold. A run checks each kept entry once, however many entries build on it, so an entry checks no file that the entries it builds on already checked. A warm `component`, `search` or `template` in a project with a large integration checks about 3,800 fewer files; output does not change.

@josephfarina
