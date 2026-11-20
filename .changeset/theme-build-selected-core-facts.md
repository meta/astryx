---
'@astryxdesign/cli': patch
---

[fix] `theme build` through a CLI installed for the computer now writes the same files as a CLI installed beside Core. It reads the component docs and types of the Core it builds with, which is the project's. So a theme that gives a component a custom variant gets its `.variants.d.ts` type declarations. Before, that CLI read them only from a Core beside it, which it does not have. It wrote no variant declarations, and `doctor` and `theme build --check` reported a theme built by another CLI as stale. The built module's doc comment now names `astryx theme build` rather than the command that ran the build, so builds through different package managers or tools write the same module.

@josephfarina
