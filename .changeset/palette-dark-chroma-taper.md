---
'@astryxdesign/cli': patch
---

[fix] `astryx theme palette generate` and `generateTonalPalette()` honor `darkChromaTaper`, so Neutral's saved palette config regenerates its committed palette. The taper mutes the dark edge of chromatic families: their dark ramps realize `edgeMultiplier` of their chroma through `throughStop`, then recover along a smoothstep to the standard recipe at `recoverAtStop`, with optional per-family multipliers. Before, the option was silently dropped, so 99 of Neutral's 420 colors came out more saturated than the committed ones. Configs without the option generate the same palette as before.

@cixzhang
