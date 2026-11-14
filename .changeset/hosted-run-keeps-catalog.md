---
'@astryxdesign/cli': patch
---

[perf] A run through `@astryxdesign/cli/host` now keeps what it gathers, as a run of the `astryx` bin does, so a tool that carries the CLI answers its second `search` from the kept catalog: about 0.47 s instead of 1.4 s. A kept entry names the package sets, integrations and command name the host passed, so a hosted run and a bin run in the same folder never read each other's answers. Answers do not change.

@josephfarina
