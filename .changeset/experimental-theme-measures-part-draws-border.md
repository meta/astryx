---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` measures more asks the way they are meant:

- "make input borders 3:1 contrast" gives the part's border color the least change that measures that ratio against the page and the part's own fill (or the part after "against"), in each mode: its own ink at a higher strength, else a deeper shade of it. It no longer restates the border the part already draws;
- "make the card text 50% more transparent" scales the text colors on the card from their own alpha, instead of fading the whole card; a part's border or fill, each variant on its own, and "all shadows" take the same relative change;
- "what is the corner radius", "what is the spacing", "what font is used", "what is the border width", "what color is the danger" answer with the theme's value in each mode it shows, and "what is the heading font" answers with the heading's font;
- "make links the color of the text", "make badges the color of the danger" take that theme color;
- "make card shadows lighter" says the card draws no shadow of its own at rest, instead of a false reason;
- "a gradient from #ff0000 to transparent" keeps the typed transparent stop instead of ending in a lighter shade;
- "what is the hover background of ghost buttons" reads the state it names: the fill at rest, with the hover or press wash Core draws over it;
- "borders 30% more transparent", "the shadow 20% more opaque", "the accent 50% more transparent" change those colors' own alpha (never the border width);
- "body font weight 450" writes 450; "how dense is it" and "what is the density" answer with the spacing instead of changing it; "shadows sharper" halves the shared shadows' blur instead of softening them; "the borders on cards heavier" makes the borders wider with no false line.

@josephfarina
