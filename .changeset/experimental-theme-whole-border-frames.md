---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set <theme> --border-width <width>`: a whole-theme border width wider than Core's own now frames the surfaces that hold content and draw no border of their own (dialogs, drawers, popovers, menus, banners, panels and the like) at the theme's width and border color, so a theme with borders has them wherever a box is drawn. A thinner width, or one of zero, frames nothing new. The result names them, with the line that keeps one borderless (`border none --on <part>`); a part's own border setting wins; buttons keep the frame the buttons dial gives, and small boxes that only draw their own text (badges, tokens, tooltips) stay as they are; both are listed with the lines that frame them. A new `edges` dial says what the borders mean: `borders` (the default, as above) or `outlines`, which frames every part that draws a box, the small ones included (an outlined, brutalist look). A width of zero frames nothing, and outlines frame at any other width, whatever the order the two are set in; the parts a surfaces dial styles keep the edge it gives them, and the rest are framed; a surface drawn inside another (a menu's list in its popover) takes that one's frame. One undo takes the frames back with the width.

@josephfarina
