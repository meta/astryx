---
'@astryxdesign/core': patch
---

[fix] Anchored layers (Popover, DropdownMenu, Selector, Tooltip, and every other `useLayer` surface) stay on screen when their trigger runs past the viewport edge, such as a control in a panel that scrolls sideways. Layers now place themselves with `anchor()` insets against the viewport instead of a position area that grows to include the trigger, and content taller than either side of the trigger stays inside the viewport on long pages.

@josephfarina
