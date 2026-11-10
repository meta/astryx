---
'@astryxdesign/theme-butter': patch
'@astryxdesign/theme-chocolate': patch
'@astryxdesign/theme-gothic': patch
'@astryxdesign/theme-matcha': patch
'@astryxdesign/theme-neutral': patch
'@astryxdesign/theme-stone': patch
'@astryxdesign/theme-y2k': patch
---

[fix] Theme packages publish the declarations of their `./theme.css` export. The export pointed `types` at `theme.css.d.ts`, which the package didn't ship, so TypeScript found no types for `import '@astryxdesign/theme-<name>/theme.css'`. The export is unchanged; the file is now published.

@cixzhang
