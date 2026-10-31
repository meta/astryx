---
'@astryxdesign/core': patch
---

[fix] In forced-colors mode (Windows contrast themes), solid `Button` variants (`primary`, `secondary`, `destructive`) keep a `ButtonText` border, and floating surfaces that separate from the page with a box shadow alone keep a `CanvasText` border: `Popover` and every surface built on `usePopover` (including `DropdownMenu`), `DropdownMenuSubMenu` flyouts, `ContextMenu`, `Dialog` and `AlertDialog`. Forced colors removes fills and box shadows, which left these controls and surfaces without an edge. The borders exist only in forced colors, so nothing changes elsewhere.
@ejc3
