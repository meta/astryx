---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render` draws recharts charts. A recharts chart draws only after its effects run, and a `ResponsiveContainer` measures its parent in a browser, so a rendered page showed an empty box for every chart. The render now draws each chart and `ResponsiveContainer` a page imports from recharts by name, after the server render, in a small document with no layout. A container starts at its own width and height, or at a width that follows its height, and the drawing scales to the width the page gives it. The `chart-size` warning now names only a chart the render could not draw.

@josephfarina
