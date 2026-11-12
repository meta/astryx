---
'@astryxdesign/cli': patch
---

[fix] The code the CLI transpiles from TypeScript files (an integration's `astryx.integration.ts`, a TypeScript config, codemod or template doc) is kept in the CLI's per-user cache folder (`~/.cache/astryx/jiti` on Linux, `~/Library/Caches/astryx/jiti` on macOS), made for the user alone, instead of the system temp folder, which on Linux every account on a machine shares; on macOS, where that folder is already per-user, the copy now survives temp clean-ups. A folder another account owns or can write to is not used; the transpiled code is then kept in memory only. Emptying the temp folder no longer makes the next run transpile everything again.

@josephfarina
