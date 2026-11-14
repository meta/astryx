---
'@astryxdesign/cli': patch
---

[feat] `astryx upgrade` rewrites the deprecated `swipeActions` and `swipeBehavior` props of `Item` and `ListItem` to `swipe={…}` where each entry is an object literal. It defines each swipe once with `createSwipe`. The definition goes to module scope when every value outside a handler is fixed at import: a literal, a JSX element, an import or a module `const`. It goes into `useMemo` in the enclosing component or hook when the options read its props or state. A function counts as one when it is declared or assigned under a capitalized or `use…` name, directly or through `memo` or `forwardRef`. Each entry with no `id` takes one named after its label or handler, else its side and place, with a TODO. On a `ListItem`, a handler that compares the row's `itemKey` value with `===` or `!==` takes it from `onActivate` instead. Where it cannot define a swipe once, as when the options call or read something at render that is neither fixed nor the component's own, or read a map callback's value, it keeps `createSwipe` on the row and leaves a TODO. On an `Item`, that TODO says an `Item` passes no `itemKey`. It reports, and leaves unchanged, a value whose entries it cannot see and a JSX spread that may carry the props.

@vjeux
