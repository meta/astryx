---
'@astryxdesign/cli': patch
---

[fix] `theme build --check` and `doctor` no longer call a local theme's outputs stale just because another CLI release built them. Each output's header still names the CLI release that built it, but that line no longer has to match. Before, every update of the CLI that answers marked every local theme stale, although a rebuild changed only that line. That CLI can be a global install, or a tool that runs the CLI for you.

@josephfarina
