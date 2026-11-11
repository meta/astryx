---
'@astryxdesign/core': patch
---

[chore] Internal: one owner module now holds the rules for a container that is the page's own scroller: whether it scrolls the page, where its visible area starts, and where its scroll events fire. `useChatStreamScroll` uses it with the same behaviour as before, and the undocumented `@astryxdesign/core/internal/page-scroller` entry gives the rules to Lab. Internal entries are outside the public API and its compatibility promise.

@cixzhang
