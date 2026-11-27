---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[fix] pnpm users no longer see an "Ignored build scripts" warning for @astryxdesign/core and @astryxdesign/cli: neither package runs a script at install any more. Installing the CLI still lists esbuild, which the CLI depends on. The setup reminder now appears the first time you run the astryx CLI each day, instead of at install; this applies to npm and yarn too. Projects that install only `@astryxdesign/core` no longer get an install-time setup line; the CLI's setup reminder and Core's README point to `astryx init`.

@vjeux
