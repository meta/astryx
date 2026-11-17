---
'@astryxdesign/core': patch
---

[fix] The checkbox check and dash and the radio dot are sized as a share of their box, so a theme that sizes the box through the `checkbox-indicator` or `radio-indicator` target's `width` and `height` gets marks in proportion to it: a 13px box draws a 7.6px check and a 5px round dot, where before the 14px check was squeezed into the box's 11px inside, filling it edge to edge, and the 10px dot nearly filled the circle. The dot is rounded to whole pixels so it stays a circle. The shipped 20px and 24px boxes draw the same pixels as before in every official theme. A theme that sets the box's `borderWidth` directly, rather than through `--border-width`, gets marks slightly smaller or larger by that difference.

@josephfarina
