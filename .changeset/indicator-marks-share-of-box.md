---
'@astryxdesign/core': patch
---

[fix] The checkbox check and dash and the radio dot are sized as a share of their box, so a theme that sizes the box through the `checkbox-indicator` or `radio-indicator` target's `width` and `height` gets marks that fit it and stay centered: a 13px box draws a 7.6px check and a 5.4px dot instead of a clipped 14px check and a 10px dot. The shipped 20px and 24px boxes draw the same pixels as before in every official theme.

@josephfarina
