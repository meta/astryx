---
'@astryxdesign/cli': patch
---

[fix] CLI: the bundled Neutral theme that `astryx theme eject` copies loads Figtree through `@font-face` rules, with a local "Figtree Fallback" face, instead of a blocking stylesheet import. `astryx theme build` no longer lists the fallback face as a font to load. `astryx theme edit` reads `@font-face` rules for its font notes: it skips a face of fonts already on the device, names each family once, and keeps the install hint.

@cixzhang
