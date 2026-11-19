---
'@astryxdesign/cli': patch
'@astryxdesign/core': patch
---

[fix] Grid: `columns={{minWidth}}` without `max` no longer overflows a container narrower than `minWidth`. A lone column now shrinks to the container width, as it already did with `max`, so a phone no longer scrolls sideways. In a container that takes its width from its content (an inline-block, or a flex item with no width), an uncapped Grid is now as wide as its content instead of `minWidth`, as a capped Grid already was.

@josephfarina
