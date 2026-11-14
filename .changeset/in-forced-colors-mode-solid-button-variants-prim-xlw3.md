---
'@astryxdesign/core': patch
---

[fix] In forced-colors mode (Windows contrast themes), `primary` and `secondary` Buttons gain a `ButtonText` border, and `destructive` keeps its `CanvasText` border; in a connected `ButtonGroup` the solid buttons keep the group's dividers and close the group's outer edge, with no doubled seam. Floating surfaces that separate from the page with a box shadow alone gain a `CanvasText` border: `Popover` and every surface `usePopover` paints (including `DropdownMenu`), `DropdownMenuSubMenu` flyouts, `ContextMenu`, and an `isInline` `Dialog`. Forced colors removes fills and box shadows, which left these controls and surfaces without an edge. The borders exist only in forced colors, so nothing changes elsewhere. A theme that sets a solid variant's own border width keeps it, so Gothic's `secondary` Button stays borderless.
@ejc3
