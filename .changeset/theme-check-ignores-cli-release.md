---
'@astryxdesign/cli': patch
---

[fix] `theme build --check` and `doctor` no longer call a local theme's outputs stale just because another CLI release built them, or the CLI ran under another command name. Each output's header still names the CLI release that built it, and a built module still names the build command, but those lines no longer have to match. Before, every update of the CLI that answers marked every local theme stale. So did building under one command name and checking under another, although a rebuild changed only those lines. That CLI can be a global install, or a tool that runs the CLI for you.

@josephfarina
