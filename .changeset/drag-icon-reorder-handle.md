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

[feat] Icon gains the `drag` semantic name, a six-dot grip by default, and the reorder handle of a reorderable List row draws it at 16px instead of three lines. The handle keeps its secondary icon color and draws no hover fill. A theme or an app replaces the grip as it replaces any icon, with `defineTheme({icons: {drag}})` or `registerIcons({drag})`; the bundled themes map it to Lucide's `GripVertical`, and the CLI's `drag` icon definition becomes a built-in one.

@ernestt
