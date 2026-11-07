---
'@astryxdesign/core': patch
---

[fix] Animated layout: the glide, the in-place swap and the edge reveal play the theme's move curve (`--ease-move`) over `--duration-medium` instead of a spring, so they follow the theme's `character` and `tempo` and land with the motion around them. Reduce Motion is unchanged: a cross-fade under a coarse pointer, an immediate change otherwise. The glides of AppShell's content area, Collapsible, Table's row expansion and TreeList change feel: 300 ms in the Neutral theme, 410 ms with no theme, instead of about 735 ms. A theme whose move easing is a `linear()` or `steps()` function glides on it, as the browser plays it. The segmented control's selection, which reads its timing the same way, now plays such an easing too instead of moving at once.

@vjeux
