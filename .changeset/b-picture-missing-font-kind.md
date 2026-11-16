---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental theme` pictures (`--png`) say when this machine has no font of the kind a stack names, for example headings set to the serif preset on a system with no serif font, which the picture shows in a sans-serif font. The font dial's help no longer says system presets always show. The note for an Apple interface face offers its generic once (`system-ui, sans-serif`), and a font name such as `constructor` is no Apple face. `astryx doctor` names the package that loads a family a theme's font stylesheet lacks (`npm install @fontsource/inter`), then the command that writes the stylesheet again.

@josephfarina
