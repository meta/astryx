---
'@astryxdesign/cli': patch
---

[experimental] On a base theme that draws headings and body in one family (neutral, butter, gothic, y2k), a body font set alone with the theme editor (`set <theme> font <font> --on body`, or an exact `--font-family-body`) keeps an empty state's title on the heading font, like every other heading; before, that title alone took the body font. On a base with two families (chocolate, matcha, stone) a body font set alone leaves that title in the body's family, as the base draws it; a heading font still gives it the heading font. A plain `font-family` set on the title, or on the empty state around it, is kept, also after a heading font, which overwrote it before.

@josephfarina
