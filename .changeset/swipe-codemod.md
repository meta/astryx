---
'@astryxdesign/cli': patch
---

[feat] `astryx upgrade` rewrites the deprecated `swipeActions` and `swipeBehavior` props of `Item` and `ListItem` to `swipe={createSwipe(…)}` where each entry is an object literal. Each entry with no `id` takes one from its side and place, such as `'trailing-0'`, so the result compiles. It adds the `createSwipe` import. It reports, and leaves unchanged, a value whose entries it cannot see and a JSX spread it cannot rewrite.

@vjeux
