---
'@astryxdesign/cli': patch
---

[fix] CLI: the Neutral theme that `astryx theme eject` copies names "Figtree Fallback" after Figtree in its body and heading stacks. That face is defined in `@astryxdesign/theme-neutral/fonts.css`; without that stylesheet the system stack applies. `astryx theme build` no longer lists a `<family> Fallback` face that follows its family as a font to load. `astryx theme edit` reads `@font-face` rules for its font notes: it skips a face that loads only fonts already on the device, names each family once, and keeps the install hint.

@cixzhang
