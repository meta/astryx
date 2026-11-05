---
'@astryxdesign/core': patch
---

[fix] A disabled `SideNavItem` no longer runs a caller's `onKeyDown`, `onKeyUp`, `onPointerDown`, `onMouseDown` or any other `on*` prop except `onFocus` and `onBlur`. Before, a key other than Enter or Space on a disabled item still reached `onKeyDown`, every key reached `onKeyUp`, and pointer or mouse input that bypasses `pointer-events: none` (programmatic or assistive-technology input) reached `onPointerDown` and `onMouseDown`. This covers the plain, link, collapsed leaf and split-row forms; the flyout trigger of a collapsed parent item is not covered. Now a disabled `SideNavItem` runs no caller handler other than `onFocus` and `onBlur`, as a disabled `Slider`, `TextInput` and `TextArea` do (`spec:AST-085` FR2). An enabled `SideNavItem` is unchanged. No API changes.

@parinith-web
