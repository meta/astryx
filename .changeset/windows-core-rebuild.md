---
'@astryxdesign/cli': patch
---

[chore] On Windows, the CLI's test setup now rebuilds a stale Core. It started `pnpm` directly, which Windows installs as a `pnpm.cmd` batch file that cannot start without a shell, so the setup stopped with `spawnSync pnpm ENOENT` before any test ran. It now runs the build through `cmd.exe`. macOS and Linux run the same command as before.

@prath47
