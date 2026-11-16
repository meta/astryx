---
'@astryxdesign/cli': patch
---

[fix] The note for an Apple interface face offers its generic once (`system-ui, sans-serif`), and a font name such as `constructor` is no Apple face. `astryx doctor` names the package that loads a family a theme's font stylesheet lacks (`npm install @fontsource/inter`), then the command that writes the stylesheet again.

@josephfarina
