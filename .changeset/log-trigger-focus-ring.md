---
'@astryxdesign/core': patch
---

[fix] `ChatMessageList`, `Tooltip` and `HoverCard`: the chat log and the span that `Tooltip` and `HoverCard` wrap around text-only children draw the theme's focus ring instead of the browser's default. A theme's `--focus-outline-*` tokens now reach them. The chat log's ring sits inside its box, so the area that scrolls it no longer cuts it off.

@cixzhang
