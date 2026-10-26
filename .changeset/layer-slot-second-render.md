---
'@astryxdesign/core': patch
---

[perf] useLayer: placing a context layer no longer re-renders its host. The hook still resolves where the layer goes from its inert marker once the marker is in the DOM, but it now hands that mount to an internal slot that renders the marker and the layer, so the render that places the layer is the slot's alone. A Tooltip, Selector or ComplexSelector that mounts closed renders once; a Popover or DropdownMenu keeps only the renders its own state costs. The host still renders when a resolved mount is replaced by a render call that moved to another host. The DOM, server markup, hydration and `lazyMount` are unchanged.

@vjeux
