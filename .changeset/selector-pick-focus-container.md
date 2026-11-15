---
'@astryxdesign/core': patch
---

[fix] Selector, MultiSelector: a pick in the list returns focus to the trigger again, whatever container the list sits in. Before, when the list sat inside a container with `tabIndex={-1}`, such as a dialog's content box, the press moved focus to that container and focus stayed there, so keyboard and screen-reader users lost their place. A press outside the list still leaves focus on the Tab stop it lands on, such as another field. A press that lands on no Tab stop returns focus to the trigger.

@vjeux
