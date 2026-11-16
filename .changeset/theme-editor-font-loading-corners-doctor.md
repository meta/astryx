---
'@astryxdesign/cli': patch
---

[experimental] Font loading is clearer in the theme editor.

- A font set names each open font that does not load until its package is installed (`fontNotLoaded`), with the install line, right under the status line.
- A family typed alone takes the fallbacks of the kind its installed Fontsource package names, so Lora gets serif ones.
- Corners on a part with no edge of its own say to give it a background or a border first.

@josephfarina
