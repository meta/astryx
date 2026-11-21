---
'@astryxdesign/core': patch
---

[fix] A dialog Popover or `usePopover` that opens from code, not from a press or a key on its trigger, and not while the pointer is on its trigger, and moves no focus into itself now announces its `dialogLabel` through the polite live region, so a screen reader can report that it appeared (WCAG 2.2 SC 4.1.3, Status Messages). Before, it appeared silently. A role-neutral popup (`role: 'none'`), such as a typeahead's listbox, is not announced.

@nynexman4464
