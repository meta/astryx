---
'@astryxdesign/core': patch
---

[fix] NumberInput: a disabled field now keeps its place in the tab order, so keyboard and screen-reader users can reach it and hear that it is unavailable (WCAG 2.2 SC 2.1.1 Keyboard, 4.1.2 Name, Role, Value and 2.4.7 Focus Visible; `spec:AST-085` FR1–FR3 and FR6). It exposes `aria-disabled="true"` and is read-only instead of carrying the native `disabled` attribute, as it already did with a `disabledMessage`; it is still dimmed, cannot be edited or stepped, and is left out of form submission. Like a natively disabled field, it runs no caller event handler other than focus and blur, and Enter does not submit its form. Its number steppers expose `aria-disabled` too, and under keyboard focus the field shows its focus ring, dimmed with the rest of the field. The Pagination page box follows.

Part of #7814.

@cixzhang
