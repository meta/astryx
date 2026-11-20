---
'@astryxdesign/cli': patch
---

[fix] The note for an Apple interface face offers its generic once (`system-ui, sans-serif`), and a font name such as `constructor` is no Apple face. `astryx doctor` names the package that loads a family a theme's font stylesheet lacks when it is an open font it knows (`npm install @fontsource/inter`), then the command that writes the stylesheet again; for a self-hosted family (such as `Acme Sans`) it gives the step to add the font stylesheet export or a local `<slug>.fonts.css`.

@josephfarina
