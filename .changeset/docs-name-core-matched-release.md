---
'@astryxdesign/cli': patch
---

[fix] `astryx docs` now names Core, and the packages Astryx releases with Core such as themes, at the Core release your project uses, as `theme add` and `doctor` do. In a project that pins Core 0.7.10, the step to add a theme shows `npm install -E @astryxdesign/theme-neutral@0.7.10`. Before, it named no version, so npm picked the newest theme, which needs a newer Core than the project has, and the install failed. In a folder with no Core, and on the docs site, the command still names the package with no version.

@josephfarina
