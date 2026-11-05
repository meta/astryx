---
'@astryxdesign/core': patch
---

[fix] A disabled `TopNavItem` no longer runs a caller's `onPointerDown`, `onMouseDown`, `onKeyDown` or any other `on*` prop except `onFocus` and `onBlur`. Before, a key pressed while script had focused a disabled item, or an event dispatched to it, still reached them, in both the default and the drawer form; only `onClick` was withheld. Now a disabled `TopNavItem` runs no caller handler other than `onFocus` and `onBlur`, as a disabled `Slider`, `TextInput` and `TextArea` do (`spec:AST-085` FR2). An enabled `TopNavItem` is unchanged. No API changes.

@parinith-web
