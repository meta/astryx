---
'@astryxdesign/core': patch
---

[fix] Tooltip: under the default `focusTrigger="auto"`, keyboard focus opens the tooltip of a trigger that was out of the tab order when the tooltip attached. A Button or IconButton in a Toolbar or ButtonGroup whose `tooltip` was set after mount, or any roving-tabindex member rendered with `tabindex="-1"`, now shows its tooltip when the arrow keys reach it. Whether focus counts is decided when it arrives, so a focusable trigger the old check missed, such as a `<summary>`, opens too. Focus inside a trigger that is not focusable still does not open it.

@cixzhang
