---
'@astryxdesign/core': patch
---

[fix] `Tooltip`: a tooltip taller than the room above and below its trigger no longer opens over the trigger. It opens beside the trigger when there is room there, otherwise on the other side if it fits there, and otherwise on the side with more room, sized to that room, scrolling content it cannot show. It also moves clear when its content grows, or its trigger or the viewport resizes, while it is open. Before, it slid over its own trigger, where a resting pointer could lose it, and content past the viewport could not be read. Tooltips that fit are placed exactly as before.

@ejhammond
