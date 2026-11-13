---
'@astryxdesign/cli': patch
---

[perf] The published CLI stores Core's component list and imports at publish, and uses them while the installed Core's files are unchanged, so `component --list` answers about 30 to 60 ms sooner in a project with no integrations. Another Core version, or a change to any Core file or folder the list reads, reads Core live, as before.

@josephfarina
