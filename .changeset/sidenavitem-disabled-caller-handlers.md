---
'@astryxdesign/core': patch
---

[fix] A disabled `SideNavItem` no longer runs a caller's `onKeyDown`, `onKeyUp`, `onPointerDown`, `onMouseDown` or any other `on*` prop. Before, a press or key on a disabled item still reached them (a key other than Enter or Space reached `onKeyDown`, and pointer and mouse events reached their handlers), for the plain, link, collapsed and split-row forms. Now a disabled `SideNavItem` runs no caller handler other than `onFocus` and `onBlur`, as a disabled `Slider`, `TextInput` and `TextArea` do (`spec:AST-085` FR2). An enabled `SideNavItem` is unchanged. No API changes.

@parinith-web
