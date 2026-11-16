---
'@astryxdesign/cli': patch
---

[fix] In a project whose base is not Core, `build` names no Core frame or foundation components, the `hook --list` and `swizzle --list` JSON name the active base as their `package`, `upgrade --from` targets the active base's installed version, runs only the codemods of integrations that build on that base, even when `astryx.config` does not list the base, checks no copied ShadCN composition (with `--registry` too), and keeps the agent-docs version `init` writes, and `doctor` checks that the active base is installed instead of reporting Core and Core's theme packages as missing.

@josephfarina
