---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
'@astryxdesign/theme-butter': patch
'@astryxdesign/theme-chocolate': patch
'@astryxdesign/theme-gothic': patch
'@astryxdesign/theme-matcha': patch
'@astryxdesign/theme-neutral': patch
'@astryxdesign/theme-stone': patch
'@astryxdesign/theme-y2k': patch
---

[feat] Icon gains the `drag` semantic name, a six-dot grip by default. The reorder handle of a reorderable List row is now that grip alone, at the `sm` size (16px) in the secondary icon color, instead of three lines in a 28px box. A mouse hits it anywhere in an invisible square of at least 24px round the grip, the WCAG 2.5.8 minimum; the focus ring's outer edge is that square's edge, and reorder mode fills the square with rounded corners. A finger keeps its 44px target: under a coarse pointer the handle stays clear of its row's end, so the list never cuts that target.

The grip resolves through the new `list-reorder-handle` component icon slot, which receives `pressed`, true while the row is in reorder mode. A theme replaces the grip for the handle alone with `defineTheme({componentIcons: {'list-reorder-handle': …}})`, or with a function of `{pressed}` to draw another grip in reorder mode, or everywhere with `defineTheme({icons: {drag}})` or `registerIcons({drag})`. The slot's `size` sets the grip, and the handle's target, its distance from the row's end, and the room ListInput and TransferList keep for it follow that size. The bundled themes map `drag` to Lucide's `GripVertical`, and the CLI's `drag` icon definition becomes a built-in one.

A complete `IconRegistry` may still omit `drag` in this release (DEP-0018). The next minor makes it required, so add a `drag` entry to any registry you type as `IconRegistry`. An icon set maps every built-in definition, so `integration check` reports `icon_builtin_definition_missing` for a set without `drag` until it maps one.

@ernestt
