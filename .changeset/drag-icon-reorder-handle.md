---
'@astryxdesign/core': patch
'@astryxdesign/theme-butter': patch
'@astryxdesign/theme-chocolate': patch
'@astryxdesign/theme-gothic': patch
'@astryxdesign/theme-matcha': patch
'@astryxdesign/theme-neutral': patch
'@astryxdesign/theme-stone': patch
'@astryxdesign/theme-y2k': patch
---

[feat] Icon gains the `drag` semantic name, a six-dot grip by default. The reorder handle of a reorderable List row is now that grip alone, at the `sm` size (16px) in the secondary icon color, instead of three lines in a 28px box. A mouse hits it anywhere in an invisible square of at least 24px round the grip, the WCAG 2.5.8 minimum; the focus ring's outer edge is that square's edge, and reorder mode fills the square with rounded corners. A finger keeps its 44px target: under a coarse pointer the handle stays clear of its row's end, so the list never cuts that target. ListInput's Remove moves 8px toward the record's end, and TransferList's 4px toward the row's end.

The grip resolves through the new `list-reorder-handle` component icon slot. A theme replaces the grip for the handle alone with `defineTheme({componentIcons: {'list-reorder-handle': …}})`, or everywhere with `defineTheme({icons: {drag}})` or `registerIcons({drag})`. The slot's `size` changes only the icon, centred on the handle's 1rem box; the handle's target and the room rows keep for it stay the same. The bundled themes map `drag` to Lucide's `GripVertical`.

A complete `IconRegistry` may still omit `drag` in this release (DEP-0018). 0.8.0 makes it required, so add a `drag` entry to any registry you type as `IconRegistry`.

@ernestt
