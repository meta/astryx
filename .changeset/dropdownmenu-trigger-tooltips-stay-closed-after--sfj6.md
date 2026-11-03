---
'@astryxdesign/core': patch
---

[fix] DropdownMenu trigger tooltips stay closed after pointer selection and still reappear for returning keyboard focus. Tooltip: turning `isEnabled` false now closes an open uncontrolled tooltip and reports `onOpenChange(false)` once; turning it back on opens the tooltip only for focus that would open it, such as returning keyboard focus.
@korkt-kim
