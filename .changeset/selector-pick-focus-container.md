---
'@astryxdesign/core': patch
---

[fix] Selector, MultiSelector: focus returns to the trigger again after a mouse pick in a Selector and when a MultiSelector closes after a pick. It also returns after a press that lands on no Tab stop, such as a container with `tabIndex={-1}` around the list. Before, inside such a container, as a dialog's content box can be, focus stayed on the container, so keyboard and screen-reader users lost their place. A press outside the list still leaves focus on the Tab stop it lands on, such as another field or a card with `tabIndex={0}`.

@vjeux
