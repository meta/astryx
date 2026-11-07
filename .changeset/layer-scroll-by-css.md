---
'@astryxdesign/core': patch
---

[fix] A Tooltip's content scrolls by CSS alone, and nothing watches its trigger move. A Tooltip now has `overflow-y: auto` from its first frame, with no overscroll containment. It scrolls only while its content overflows, so a wheel over a Tooltip that fits still scrolls the page. Once a tall Tooltip has scrolled to its end, the next wheel moves on to the page, where before the page held. A Tooltip is now always a scroll container, so `position: sticky` and `scroll(nearest)` timelines inside its content resolve against the Tooltip. The layer runtime no longer reads the Tooltip's scroll size after its trigger moves, and it no longer observes a trigger that moves without resizing.

@cixzhang
