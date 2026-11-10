---
'@astryxdesign/cli': patch
---

[feat] The integration file takes an optional `logo` (`{light, dark?}`, paths to images the package ships): the logo catalogs show beside the package name. A package.json `marketplace.logo` is still read when the integration file has none. `astryx integration check` adds two notes that say what a catalog needs to list a package: `package_without_logo`, when the logo names no PNG, JPEG, WebP or shapes-only SVG of at most 512 KB that the package ships, and `package_without_example`, when the package has components but no example block. A package of themes, docs or codemods alone needs no example, and a package of icon sets alone draws neither note. Both are `next` notes: they fail `integration check --strict --next` now and `--strict` from the next minor release. The new "Get your package ready to list" section of `astryx docs authoring/ship/checks` shows how to add both.

@josephfarina
