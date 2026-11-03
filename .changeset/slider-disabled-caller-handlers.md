---
'@astryxdesign/core': patch
---

[fix] A disabled `Slider` no longer runs a caller's `onPointerDown`, `onPointerMove`, `onPointerUp`, `onPointerCancel`, `onKeyDown`, `onClick` or any other `on*` prop. Before, a press, drag or key on a disabled slider still reached them, for both the single and the range form. Now a disabled `Slider` runs no caller handler other than `onFocus` and `onBlur`, as a disabled `TextInput` and `TextArea` do (`spec:AST-085` FR2). An enabled `Slider` is unchanged. No API changes.

@parinith-web
