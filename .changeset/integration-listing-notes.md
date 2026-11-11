---
'@astryxdesign/cli': patch
---

[feat] The integration file takes an optional `logo` (`{light, dark?}`, paths to images the package ships): the logo catalogs show beside the package name. When the integration file has no `logo`, the check uses package.json `marketplace.logo`. `astryx integration check` adds two notes that say what a catalog needs to list a package: `package_without_logo`, when the logo names no PNG, JPEG, WebP or shapes-only SVG of at most 512 KB that the package ships, and `package_without_example`, when the package has components but no example block. A package of themes, docs or codemods alone needs no example, and a package of icon sets alone draws neither note. Both are information only: they fail no check, with or without `--strict` or `--next`. The new "Get your package ready to list" section of `astryx docs authoring/ship/checks` shows how to add both.

@josephfarina
