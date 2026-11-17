---
'@astryxdesign/cli': patch
---

[experimental] A gradient the theme editor writes for a variant, a state or a mode is built as the background longhands its value gives (`background-image`, and a layer's own position, size and repeat), never the `background` shorthand. A background longhand set on the whole part, such as `background-repeat no-repeat` on a button, now still applies in every variant and state, so a hover gradient no longer tiles. When the build still writes a shorthand there (a plain `background` color for one variant) and it resets such a longhand, the result says which.

@josephfarina
