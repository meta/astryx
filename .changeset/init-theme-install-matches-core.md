---
'@astryxdesign/cli': patch
---

[fix] `astryx init`'s theme step now names the theme at the project's Core release, as `theme add` and `doctor` already do. In a project that pins Core 0.7.10, it prints `npm install -E @astryxdesign/theme-neutral@0.7.10`. Before, it named no version, so npm picked the newest theme, which needs a newer Core than the project has, and the install failed. `doctor`'s hint for an app with no theme and `theme build`'s hint to install a missing theme follow the same rule.

@josephfarina
