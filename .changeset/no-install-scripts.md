---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[fix] pnpm users no longer see an "Ignored build scripts" warning for @astryxdesign/core and @astryxdesign/cli: neither package runs a script at install any more, so nothing prints at install with any package manager. Installing the CLI still lists esbuild, which the CLI depends on. The setup reminder the CLI already shows, at most once a day per project, is unchanged. Projects that install only `@astryxdesign/core` no longer get an install-time setup line; the CLI's setup reminder and Core's README point to `astryx init`.

@vjeux
