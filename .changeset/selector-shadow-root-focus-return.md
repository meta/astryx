---
'@astryxdesign/core': patch
---

[fix] Selector and MultiSelector inside a shadow root: after a press on a container around the list that is no Tab stop, such as one with `tabIndex={-1}`, closing the list returns focus to the trigger, as it does outside a shadow root. Focus stayed on the container, because the close read the shadow root's host as the focused element.

@cixzhang @vjeux
