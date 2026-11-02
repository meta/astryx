---
'@astryxdesign/core': patch
---

[fix] Avatar, BreadcrumbItem, Button, Lightbox, SegmentedControlItem, Tab, Tokenizer: a slot whose value is `0` showed a stray "0" beside its slot, or, in SegmentedControlItem's and Tab's icons and Tab's end content, was dropped. That covers `status`, `startIcon`, `icon`, `endContent`, a Lightbox `caption` and `selectedIcon`. Now each slot follows the shared presence check. Empty values (`null`, `false`, `''`) render no slot, as an omitted one does, and `0` renders inside its slot as content. A Tab whose `selectedIcon` is `0` shows it while selected instead of falling back to `icon`.

@cixzhang
