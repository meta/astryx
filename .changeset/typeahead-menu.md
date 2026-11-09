---
'@astryxdesign/core': patch
---

[feat] BaseTypeahead takes `menu`, which chooses what its anchored menu shows while Astryx keeps the layer: its position, top layer, outside press, Escape, focus return and ARIA. `{role: 'listbox', render}` places information such as a header or a key hint around the result list, and anything a person acts on stays a result, so the arrow keys reach it (a control outside the list warns in development). `{role: 'dialog', label, render}` shows content that takes focus in a dialog named by `label`; closing it returns focus to the element focused when it opened, or to the input. A new `handleRef` exposes `open()` and `close()`, and `onOpenChange` reports each change; there is no controlled open state. Calling `open()` from `onChange` keeps the menu open, so a pick can switch the list to a dialog on the same layer. Typeahead forwards `menu` and `handleRef`.

@cixzhang
