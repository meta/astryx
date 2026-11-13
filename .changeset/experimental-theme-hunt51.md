---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: one entry normalizer reads every setting before any check, typed or saved. Every Unicode space (no-break, thin) is a plain space and zero-width characters go, for every value type; a saved value holding one is named with the clean value to set. A declaration typed whole or split (`accent: #e11d48`, `--color-accent=#e11d48`, `font:inter`, `accent:` then the value) is the setting and its value, for dials and tokens; a token typed with an em or en dash or as `var(--x)` is that token, and one typed without its dashes is offered with them. A refused value's suggestion comes from that setting's own check: `text-size 14pt` suggests the size in pixels, `type large` or `type 18px` suggests text-size (never corners), `mode` lists its modes, and a saved size token suggests its own value with a unit.

@josephfarina
