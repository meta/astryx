---
'@astryxdesign/cli': patch
---

[fix] `astryx docs` now names Core, the CLI, and the packages Astryx releases with Core such as themes, at the Core release your project uses, as `theme add` and `doctor` do. In a project that pins Core 0.7.10, the step to add a theme shows `npm install -E @astryxdesign/theme-neutral@0.7.10`. Before, it named no version, so npm picked the newest theme, which needs a newer Core than the project has, and the install failed. In a folder with no Core, on the docs site's pages, and in a step that first moves to another folder, the commands still name the packages with no version. The docs site's MCP endpoint names the Core release it documents.

@josephfarina
