---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how "glossy buttons"` makes the gloss from the part's own fill in each mode instead of one sample indigo gradient on every part: the fill ten tones lighter at the top and ten tones darker at the bottom, through the fill (a white fill keeps white at the top, a black fill black at the bottom), written as its colors. The fill is a color said in the ask ("glossy blue buttons", "Top bar: dark (#222), glossy"), else the fill the theme sets on the part, else each variant's own fill; a variant or part that draws no fill of its own, such as a top nav inside a bar, writes nothing.

@josephfarina
