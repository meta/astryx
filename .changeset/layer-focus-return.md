---
'@astryxdesign/core': patch
---

[fix] Popover and DropdownMenu, in their popover presentation, and Dialog move focus as they close only when the close would strand it (WCAG 2.2 SC 2.4.3, Focus Order). Focus that used to fall to the page body when the opener was gone now goes, in order, to the element focused when the layer opened, its trigger, the control that names the layer in `aria-controls`, the component's own stand-in (a typeahead's input), the anchor or the first control inside it, the opener's former place in its group, the nearest surviving ancestor, the layer that opened this one, then the page's `main` region. A released behavior also changes: a DropdownMenu no longer focuses its trigger at close when focus never entered the menu. The `useFocusTrap` hook shares the trap that Popover uses, so it returns focus the same way. A Drawer keeps its own return at close and gets the shared one only when it is removed while open. There is no option to turn focus return off. To send focus somewhere specific, focus it in `onOpenChange` (Popover, DropdownMenu) or in `usePopover`'s `onHide`; for a Dialog, focus it after the dialog has closed, since the page outside an open dialog is inert. A Popover or DropdownMenu returns focus before the browser's own restore, so its trigger gets a focus ring only after keyboard input.

@nynexman4464
