---
'@astryxdesign/cli': patch
---

[feat] `astryx upgrade` rewrites the deprecated `swipeActions` and `swipeBehavior` props of `Item` and `ListItem` to `swipe={createSwipe(…)}`, and renames the four `ItemSwipe*` types. It adds the `createSwipe` import, and reports a JSX spread it cannot rewrite.

@vjeux
