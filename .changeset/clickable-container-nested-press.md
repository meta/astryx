---
'@astryxdesign/core': patch
---

[feat] A clickable card no longer shows its pressed look when a press starts on a control inside it, such as an info button, a button, or a link, since that press does not open the card. `useClickableContainer` returns `onPointerDown` beside `onClick` and `onMouseUp`; spread it on the container to get the same behavior in your own clickable container. A container that does not spread it works as before.

@cixzhang
