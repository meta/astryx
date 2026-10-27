---
'@astryxdesign/core': patch
---

[fix] `HoverCard` and `useHoverCard` no longer open on keyboard focus of the trigger while `isOpen={false}` is passed. The controlled `false` already refused hover, but tabbing onto the trigger opened the card and reported `onOpenChange(true)` against the owner's state; focus now takes the same refusal as hover.

@thecodebasedot
