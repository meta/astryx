---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[feat] ChatMessageList renders an item model, and useChatMessageListVirtualization windows it inside ChatLayout, so a conversation of thousands of messages mounts about one screen of rows

- Pass `items`, `getItemKey` and `renderItem` instead of children. Without `virtualization`, every item renders, as children do. The `children` API is unchanged.
- With `virtualization={useChatMessageListVirtualization()}` inside ChatLayout, only the rows near the scrollport mount. A row mounts at its own height and measures itself; the spacers that stand for unmounted messages use their measured sizes, or `estimateItemSize` (96 px by default) for messages that have not rendered yet. The list opens at its newest message.
- While ChatLayout follows the newest message, the end stays in place as rows above it measure; otherwise the message the reader is on stays in place, also when older messages load at the top. While the reader scrolls, the list writes no scroll position for a correction: it holds the correction until the scroll ends, so a finger's momentum keeps going.
- The newest message always stays mounted, so a streaming reply and new messages are followed as before, and a ChatMessage that arrives while the reader is in history shows New messages on the scroll button, as with children.
- `handleRef.scrollToItem(key, {align})` scrolls to a message that is not mounted, for find in a conversation and links to a message. Browser find in page sees only the mounted rows.
- The hook has an example block: `astryx template useChatMessageListVirtualizationHookUsage`.

@kentonquatman
