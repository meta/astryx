---
'@astryxdesign/core': patch
---

[fix] Names built from a node's text now read as the text renders. Inline markup no longer splits words, so a screen reader hears "unlikely" for `un<b>like</b>ly`, "H2O" for `H<sub>2</sub>O` and "42%" for `{42}%`, where before it heard "un like ly", "H 2 O" and "42 %". This covers a Table column-resize handle named by a node header, a List reorder announcement for a row whose label holds markup, and a toast whose body is plain text in parts. A block element, a line break and a component still stand apart with a space.

@cixzhang
