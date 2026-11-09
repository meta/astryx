---
'@astryxdesign/core': patch
---

[chore] Internal: per-instance warning deduplication and temporary focus targets each have one shared owner in Core. Resizable, Dialog and TabList dedupe their development warnings through it, and Chat's Done button parks focus through it. Warning text and focus behavior are unchanged; apps import nothing new.

@humbertovirtudes
