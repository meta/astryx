---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads more questions the way they are asked:

- "make cards the color of the page" gives cards the page's color and never changes the page ("but 10% darker" steps that color in each mode; an amount before "lighter" or "darker" after "but" stays with the ask);
- "make dialog shadows 50% more transparent", "20% less opaque" scale each shadow layer's own alpha, in each mode, instead of writing one alpha on every layer; a part that draws no shadow of its own says so;
- "make borders 3:1 contrast" gives the border color at the lowest strength that measures that ratio against the page, surfaces and cards in each mode, instead of a fainter border;
- "what color is the text", "what color is the accent", "what is the body text size" answer with the theme's value in each mode it shows;
- "more colorful" and "less saturated" are judged by how colorful the accents look (OKLCH chroma, the measure vibrancy moves), so a pale accent such as butter's dark yellow can be made more colorful.

@josephfarina
