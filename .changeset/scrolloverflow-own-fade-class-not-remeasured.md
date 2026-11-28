---
'@astryxdesign/core': patch
---

[perf] A scrolling `TabList` no longer reads its scroll geometry a second time when its own edge fade changes. The fade is a class chosen from the edges `useScrollOverflow` has just measured, and the hook used to observe that class write as a change to the content and measure again (it now skips a class write that only sets the fade's own classes), forcing another style and layout pass for each fade change. An app's own class or style change, including one made in the same commit as an edge change, and tabs added or removed, still measure.

@HelloOjasMutreja @duytbp
