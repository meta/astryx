---
'@astryxdesign/cli': patch
---

[fix] Installing the CLI with pnpm 11 no longer stops on esbuild's install script; `astryx experimental export` uses a matching native esbuild when one is installed, else a slower built-in one. The CLI now installs esbuild-wasm, which has no install script, instead of esbuild. `pnpm add @astryxdesign/cli` succeeds on pnpm 11 once Core's and the CLI's postinstall scripts are removed too, in a separate change. The export uses a native esbuild whose version satisfies the CLI's esbuild-wasm range, `^0.28.2` in this release: your project's own first, then one installed beside the CLI. Otherwise it uses esbuild-wasm, which may run about twice as slowly; for native speed, add `esbuild` as a dev dependency of your project.

@vjeux
