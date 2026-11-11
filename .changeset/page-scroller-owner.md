---
'@astryxdesign/core': patch
---

[chore] Internal: `useChatStreamScroll`'s page-scroller rules move to one owner module: whether a container scrolls the page, where its visible area starts, and where its scroll events fire. The hook behaves as before, and the undocumented `@astryxdesign/core/internal/page-scroller` entry gives the same rules to Lab's ChatVirtualizer. Internal entries are outside the public API and its compatibility promise.

@cixzhang
