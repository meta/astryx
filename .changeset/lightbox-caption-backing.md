---
'@astryxdesign/core': patch
---

[fix] `Lightbox`'s caption text keeps a 4.5:1 contrast ratio in every theme. In light mode the caption's light text sat on the light translucent backdrop, as low as 2.6:1. It now sits on the same dark translucent backing as the counter, line by line; the caption keeps its height and place.

@cixzhang
