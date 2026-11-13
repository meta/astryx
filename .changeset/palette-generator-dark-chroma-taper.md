---
'@astryxdesign/cli': patch
---

[fix] `astryx theme palette generate` and `generateTonalPalette()` honor `darkChromaTaper`, so every official theme palette regenerates from its saved config exactly as committed. Neutral's config asks for a muted dark edge on its chromatic families, but the generator dropped the field: 99 of Neutral's 420 colors came out more saturated than the committed ones (`blue.dark[25]` was `#003978`, not `#253c5a`). A dark stop now keeps `edgeMultiplier` of its in-gamut chroma through `throughStop`, then recovers along a smoothstep to the standard recipe at `recoverAtStop`; `familyMultipliers` sets the edge share for one family. Light ramps, neutral families, the black and white endpoints, and configs without the field generate the same colors as before. A taper with a field it does not read, a stop outside the layout, a family the request does not have, a neutral family, or a multiplier outside 0 to 1 is refused.

@josephfarina @cixzhang @korkt-kim
