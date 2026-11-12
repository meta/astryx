---
'@astryxdesign/cli': patch
---

[feat] `astryx upgrade` rewrites the deprecated `swipeActions` and `swipeBehavior` props of `Item` and `ListItem` to `swipe={…}` where each entry is an object literal. It defines each swipe once with `createSwipe`: at module scope, or in `useMemo` when a handler reads component state. Each entry with no `id` takes one named after its label or handler. On a `ListItem`, a handler that reads the row's `itemKey` value takes it from `onActivate` instead. Where it cannot define a swipe once, it keeps `createSwipe` on the row and leaves a TODO. It reports, and leaves unchanged, a value whose entries it cannot see and a JSX spread that may carry the props.

@vjeux
