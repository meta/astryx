---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set <theme> --shadow-<level> none`: when a theme takes away the elevation shadow, the overlays and menus that read it and draw no border keep an edge at the theme's border, so an open menu or popover never reads as a blank panel on a page of the same color. The result names them, with the line that keeps one bare; a border or shadow of the part's own wins; a theme border width frames them already. `how`'s answer check accepts that edge where the answer takes the shadow away. A theme whose border width is zero draws no borders, so it keeps no edge either.

@josephfarina
