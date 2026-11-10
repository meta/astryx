---
'@astryxdesign/core': patch
---

[fix] on a touch screen, keys typed into a text field no longer make the focus a closing dialog returns to a Tooltip or HoverCard trigger open its layer; Tab, Escape and arrow keys still count as keyboard input. `useTouchTrigger`'s `isTouchInteraction()` from `@astryxdesign/core/Layer` stays true in that case too. A field in an iframe or Picture-in-Picture window is not read as a text-entry field, so typing there still opens the tooltip as before (#9464)
@harjothkhara
