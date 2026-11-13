---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: card padding and radius written exactly.

- On a part whose padding Core writes one variable per side (card and the other containers), the editor writes each side itself, split as CSS splits a shorthand: `calc(4px + 2px) 8px`, `clamp(12px, 2vw, 24px)` and four different sides reach the part as typed.
- A variant's padding after a side set for every variant now shows: the editor writes the variant's side variables too, instead of refusing it.
- A card radius of more than one value (`12px 12px 0 0`, `10px / 20px`) gives each corner its own radius; the content that reaches the card's edges takes one radius, the first corner's, and the result says so.

@josephfarina
