---
'@astryxdesign/core': patch
---

[feat] A Lightbox gallery's caption sits in a band two lines tall under every photo, so the photo keeps one size and place from item to item. A photo with no caption keeps the band's space without its backing. A longer caption shows two lines, the second ending in an inline "more" link, which opens the whole caption over the photo. The whole caption is always the viewer's accessible description.

The viewer is a media surface: its controls, caption and counter take the theme's dark surface tokens through `MediaTheme`. The caption is body `Text` whose lines start at one edge, "more" and "less" are `Link`'s button form in the caption's own type, and the band clears the screen's bottom edge and its safe area. A gallery's caption sits on a backing that keeps it at 4.5:1 over any photo. A tap that opens the viewer paints no focus ring on its first control, and paging from a focused "more" or "less" keeps focus in the viewer.

@vjeux
