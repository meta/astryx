---
'@astryxdesign/cli': patch
---

[experimental] render: a page's own styles compile with their own class-name prefix, so they never share a class with Core's stylesheet. Core's rules keep their layer on Core's elements (a Table's first and last cells keep their edge padding), and a page's override of a component still wins, as in the app.

@josephfarina
