---
'@astryxdesign/core': patch
---

[feat] A Lightbox gallery's caption sits in a band two lines tall under every photo, so the photo keeps one size from item to item. A longer caption shows two lines and a "more" button, which opens the whole caption over the photo. The whole caption is always the viewer's accessible description.

The viewer is a media surface: its controls, caption and counter take the theme's dark surface tokens through `MediaTheme`. The caption is body `Text` whose lines start at one edge, "more" and "less" are a ghost `Button`, and the band clears the screen's bottom edge and its safe area. The caption sits on a backing that keeps it at 4.5:1 over any photo. A tap that opens the viewer paints no focus ring on its first control, and paging from a focused "more" or "less" keeps focus in the viewer.

@vjeux
