---
'@astryxdesign/core': patch
---

[fix] MultiSelector: after keyboard input, the active option draws the focus ring, so keyboard users can see which option Enter toggles. The hover fill alone measured under 3:1 against the list. After pointer input the active option keeps the fill alone, as in Selector.

@cixzhang
