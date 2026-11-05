---
'@astryxdesign/core': patch
---

[fix] A disabled `Tab` no longer runs a caller's `onPointerDown`, `onMouseDown`, `onKeyDown` or any other `on*` prop except `onFocus` and `onBlur`. Before, a press or key on a disabled tab still reached them, for both the button and the link form; only `onClick` was withheld. Now a disabled `Tab` runs no caller handler other than `onFocus` and `onBlur`, as a disabled `Slider`, `TextInput` and `TextArea` do (`spec:AST-085` FR2). An enabled `Tab` is unchanged. No API changes.

@parinith-web
