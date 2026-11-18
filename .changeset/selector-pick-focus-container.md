---
'@astryxdesign/core': patch
---

[fix] Selector, MultiSelector: focus returns to the trigger again after a mouse pick in a Selector and when a MultiSelector closes after a pick. It also returns after a press on a container around the list that is no Tab stop, such as one with `tabIndex={-1}`. Before, inside such a container, as a dialog's content box can be, focus stayed on the container, so keyboard and screen-reader users lost their place. A press elsewhere still leaves focus where it lands, such as on another field or an unselected tab. So does a press on a container that is a Tab stop, such as a card with `tabIndex={0}`.

@vjeux
