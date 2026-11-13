---
'@astryxdesign/cli': patch
---

[fix] `astryx theme add` wires a theme the theme editor made: a folder under `themes/` holding `<name>.settings.json` is listed as a local theme, and adding it records its built `<name>.js` and `<name>.css` the way a built local theme is recorded; `theme use` and `theme remove` work with it as with any local theme. Before, it was refused as an unknown theme. A theme the editor has not built yet is refused with the editor command that builds it.

@josephfarina
