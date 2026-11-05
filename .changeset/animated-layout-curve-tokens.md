---
'@astryxdesign/core': patch
---

[fix] Animated layout: the glide, the in-place swap and the edge reveal play the theme's move curve (`--ease-move`) over `--duration-medium-min` instead of a spring, so they follow the theme's `character` and `tempo` and land with the motion around them. Reduce Motion is unchanged: a cross-fade under a coarse pointer, an immediate change otherwise. The glides of AppShell's content area, Collapsible, Table's row expansion and TreeList change feel: 225 ms in the Neutral theme, 310 ms with no theme, instead of about 735 ms.

@vjeux
