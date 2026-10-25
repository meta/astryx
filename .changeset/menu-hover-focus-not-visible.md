---
'@astryxdesign/core': patch
---

[fix] DropdownMenu, ContextMenu: after a pointer press, a row the mouse rests on, or a held press is dragged over, takes focus without matching `:focus-visible`. A plain focus inherited the state from the focus before it (the menu after a pointer open), so any keyboard-only focus style, a theme's or an app's, painted on the row under the mouse. That focus now follows the last input, as other programmatic focus in Astryx does: after a keyboard open, or a key press, the indicator stays. Checkbox, radio and sub-menu rows, and the ContextMenu and Breadcrumbs menus built on them, follow. Browsers without the focus option (Chrome and Edge before 145, Safari before 18.4) keep the earlier behavior.

@vjeux
