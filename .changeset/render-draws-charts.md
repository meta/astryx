---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render` draws recharts charts. A recharts chart draws only after its effects run, and a `ResponsiveContainer` measures its parent in a browser, so a rendered page showed an empty box for every chart. The render now draws each chart and `ResponsiveContainer` a page imports from recharts by name, after the server render, in a small document with no layout. A container starts at its own width and height, or at a width that follows its height, and the drawing scales to the width the page gives it. The `chart-size` warning counts the charts the render could not draw, and says when charts were drawn by themselves (when the page cannot be drawn again without a browser, or its effects change its charts or re-render the component that makes them). Charts show the data and props of the page's first render; a value a chart's parts read from a React context that an effect changes may show its later value.

@josephfarina
