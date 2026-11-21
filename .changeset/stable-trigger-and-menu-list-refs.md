---
'@astryxdesign/core': patch
---

[perf] A re-render with unchanged props no longer detaches and attaches again a `ComplexSelector`'s trigger or a `DropdownMenu`'s menu list. Each render gave those elements a new callback ref, so React called the old ref with `null` and the new ref with the element. That ran the popover's anchor bookkeeping again, and on a `renderTrigger` control it also ran the caller's `ref` and the control's own refs again. The refs now keep their identity across renders. No API changes.

@vjeux
