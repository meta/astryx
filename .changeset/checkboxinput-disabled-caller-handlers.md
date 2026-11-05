---
'@astryxdesign/core': patch
---

[fix] A disabled `CheckboxInput` no longer runs a caller's `onKeyDown`, `onKeyUp`, `onPointerDown`, `onMouseDown` or any other `on*` prop except `onFocus` and `onBlur`. Before, a disabled checkbox stayed focusable and clickable, so a key or pointer press on it still reached them; only `onClick` was withheld. Now a disabled `CheckboxInput` runs no caller handler other than `onFocus` and `onBlur`, as a disabled `Slider`, `TextInput` and `TextArea` do (`spec:AST-085` FR2). An enabled `CheckboxInput` is unchanged. No API changes.

@parinith-web
