---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme` pictures show what a person sees once the page runs:

- A calendar on the sheet shows its days: a part whose server render keeps content inert until the browser runs is drawn as the browser mounts it.
- The open states page draws a context menu (right-clicked), a submenu's flyout, a popover that holds a form, a date and time field's time list, a command palette's items and a narrow screen's navigation drawer. Its drawing asks about the pointer as a desktop's mouse does, presses the controls an opened overlay holds, and closes an open popover when it presses outside it, as a browser does.
- A states section draws each control of the sample page at rest, hovered, focused from the keyboard and pressed: the page marks each one with its state, and the render's stylesheet applies that state's rules to it.
- A nav icon gets the icon its doc suggests, and an icon-only button gets an icon, so neither draws empty or spills its name.
- A border set on the inputs lands on a date and time field's two boxes, not the row around them, so it draws once on each box.

@josephfarina
