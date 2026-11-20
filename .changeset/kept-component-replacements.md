---
'@astryxdesign/cli': patch
---

[perf] Which integration component answers to a Core component's name is kept between runs with the component list, so `component` in a project whose integration replaces Core components no longer loads every one of that integration's component docs on each run: about 40 to 60 ms faster per call in a project with a large integration. It is decided again whenever a doc's `replaces`, the package's CLI range, the integration's components folder, its configuration or its manifest changes. Output does not change.

@josephfarina
