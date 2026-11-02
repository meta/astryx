---
'@astryxdesign/core': patch
---

[fix] `DropdownMenu` no longer rewrites its trigger's style on every render. Its trigger refs, and the trigger ref `usePopover` returns, now stay the same function when the popover's `onShow` or `onHide` changes, so React stops detaching and reattaching the trigger, and a tooltip anchored to the same trigger keeps its place. Triggers that take `usePopover`'s ref directly (ComplexSelector's built-in trigger, DateTimeInput's date field and Breadcrumbs) get the stable ref too.
@vjeux
