---
'@astryxdesign/core': patch
---

[chore] Internal: one owner module now turns the browser's scroll anchoring off on a container whose position a component owns. `useChatStreamScroll` uses it while it follows the end, with the same behaviour as before, and the undocumented `@astryxdesign/core/internal/scroll-anchoring` entry gives its writer to Lab. Internal entries are outside the public API and its compatibility promise.

@cixzhang
