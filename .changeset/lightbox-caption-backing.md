---
'@astryxdesign/core': patch
---

[fix] `Lightbox`'s caption text keeps a 4.5:1 contrast ratio in every shipped theme, light and dark. In light mode the caption's light text sat on the light translucent backdrop, as low as 2.6:1. It now sits on the same dark translucent backing as the counter, line by line; each line gains the backing's inline padding, so a caption can grow 16px wider or wrap one line sooner.

@cixzhang
