---
'@astryxdesign/cli': patch
---

[fix] `doctor`'s fix for a missing Core, and `theme build`'s hint to install Core, now name Core at the same release as the theme hints. That is the Core release the project already names, in its dependencies or peer dependencies, or, when it names no Core at all, the release of the CLI that answers. Before, they named the newest Core. A project that followed both hints could get a Core that its theme's exact Core peer does not accept.

@josephfarina
