---
'@astryxdesign/core': patch
---

[fix] A disabled `Slider` no longer runs a caller's handlers. Before, the thumbs stay focusable through `aria-disabled` instead of the native `disabled` attribute, so the browser stopped dropping events on them, and a caller's `onPointerDown`, `onPointerMove`, `onPointerUp`, `onPointerCancel`, `onKeyDown` and every other `on*` prop (such as `onClick`) still ran on a disabled slider. Now a disabled `Slider` runs no caller handler other than `onFocus` and `onBlur`, for both the single and the range form, as a disabled `TextInput` and `TextArea` do (`spec:AST-085` FR2). An enabled `Slider` is unchanged. No API changes.

@parinith-web
