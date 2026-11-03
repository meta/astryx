---
'@astryxdesign/core': patch
---

[feat] ClickableCard and SelectableCard no longer show their pressed look when a press starts on a control inside them, such as an info button, a button, or a link. `useClickableContainer` returns `onPointerDown`; on a container that paints its press with `usePressFeedback`, spreading it drops a touch press that starts on a nested control. A mouse `:active` press paint is unchanged. A container that does not spread it works as before.

@cixzhang
