---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[feat] A theme icon entry in `defineTheme({icons})` or `registerIcons()` can be a pure, synchronous function of `{size, variant}`; `Icon` calls it with the size it renders at, so a theme can match its icon library's artwork or props to each Icon size. A selected function's result is final: `null` draws no glyph instead of falling back. `getIcon`, `getExtendedIcon`, `getIconRegistry`, `useIcon`, and a theme's `icons` field stay node-valued and read a function entry at `{size: 'md'}`. Existing node entries are unchanged.
@imdreamrunner
