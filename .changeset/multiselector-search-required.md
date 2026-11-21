---
'@astryxdesign/core': patch
---

[fix] `MultiSelector` with `hasSearch`: the trigger button no longer carries `aria-required`, which ARIA does not allow on a button (WCAG 2.2 SC 4.1.2, Name, Role, Value). Before, the button carried it, an attribute a button may not have. A required field still says so: the field label's visible marker is part of the trigger's name, or a hidden "Required" description is added when the marker is not shown, and the search box carries `aria-required` while the list is open. This matches `Selector`.

@josephfarina
