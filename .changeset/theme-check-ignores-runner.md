---
'@astryxdesign/cli': patch
---

[fix] `theme build --check` no longer reads a theme as out of date when only the package manager that built it differs. A built theme module names the command that built it ("built by `pnpm dlx … theme build`"), so a theme built with pnpm and checked with npm, in a project's CI for example, failed the check with identical outputs. The check now treats that one line like the header's `Command:` line, as `integration verify` already does; any other change to the module is still out of date.

@cixzhang
