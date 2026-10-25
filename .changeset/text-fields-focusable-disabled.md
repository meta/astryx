---
'@astryxdesign/core': patch
---

[fix] TextInput, TextArea: a disabled field now keeps its place in the tab order, so keyboard and screen-reader users can reach it and hear that it is unavailable (WCAG 2.2 SC 2.1.1 Keyboard, 4.1.2 Name, Role, Value and 2.4.7 Focus Visible; `spec:AST-085` FR1–FR3 and FR6). It exposes `aria-disabled="true"` and is read-only instead of carrying the native `disabled` attribute, as the field already did when a `disabledMessage` was set. It is still dimmed, cannot be edited, and is left out of form submission. Like a natively disabled field, it runs no caller event handler other than focus and blur, and Enter in a disabled TextInput does not submit its form. Under keyboard focus it shows the field's focus ring, dimmed with the rest of the field.

Part of #7814.

@HelloOjasMutreja
