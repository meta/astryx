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

[feat] Icon gains the `drag` semantic name, a six-dot grip by default, and the reorder handle of a reorderable List row draws it at 16px instead of three lines. The handle keeps its secondary icon color and draws no hover fill. The grip resolves through the new `list-reorder-handle` component icon slot, so a theme replaces it for the handle alone with `defineTheme({componentIcons: {'list-reorder-handle': …}})`, or everywhere with `defineTheme({icons: {drag}})` or `registerIcons({drag})`. The bundled themes map `drag` to Lucide's `GripVertical`.

A complete `IconRegistry` may still omit `drag`: an omitted `drag` draws the default six-dot grip. From 0.8.0 a complete `IconRegistry` must map `drag`, so add a `drag` entry to any registry you type as `IconRegistry`.

@ernestt @cixzhang
