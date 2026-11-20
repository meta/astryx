---
'@astryxdesign/cli': patch
---

[experimental] Icon definitions: two new definitions, `fullScreen` (show something full screen) and `exitFullScreen` (leave full screen), so an icon set can map its full-screen icons apart from the icons it maps to `expand` and `collapse`. `expand` and `collapse` are unchanged for now, so every set keeps answering full-screen asks with the icons it maps today; sets that map neither new definition keep working, and `experimental icon --definitions` and `integration check` list them as optional.

@josephfarina
