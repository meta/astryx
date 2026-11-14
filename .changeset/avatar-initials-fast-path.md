---
'@astryxdesign/core': patch
---

[perf] `Avatar` works out initials without a grapheme segmentation pass when a word starts with a Latin, IPA or other character below U+0300 followed by one that cannot extend it, which covers most names. Each such word costs a few nanoseconds instead of a few microseconds, so a page that server-renders 100 avatars saves about half a millisecond. Table's header capitalization uses the same helper. Output is unchanged.

@cixzhang
