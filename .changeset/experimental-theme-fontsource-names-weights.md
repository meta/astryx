---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: a font family maps to its Fontsource package as Fontsource names it: a `<Name> Variable` family to `@fontsource-variable/<name>`, which loads it once installed, and other characters dropped (`Mrs. Sheppards` is `@fontsource/mrs-sheppards`). No package is suggested for a font a system ships on any platform (such as Microsoft YaHei or PingFang SC) or a name Fontsource cannot publish. An installed font package loads every weight the theme uses (a stylesheet per weight, as Fontsource ships them), in the app copy and the previews. The font dial takes a CSS-escaped family, as tokens do. `compile --check` names a missing output in its check result.

@josephfarina
