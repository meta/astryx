---
'@astryxdesign/core': patch
---

[perf] Table: a collapsed row-expansion chevron carries no positioned box, and no transform outside right-to-left tables. Safari on iPhone pays for every such box in a table on each frame of a row glide, so a long expandable table had two of them per row. The chevron looks and turns the same, and a theme's glyph size still leaves the row height alone.

@cixzhang
