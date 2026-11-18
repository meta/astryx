---
'@astryxdesign/core': patch
---

[fix] Banner's dismiss button, a field's clear button and Timestamp's copy button no longer have their short tooltip read as a description when their accessible name already contains it, as in English ("Dismiss Project A was archived", "Clear Assignee", "Copy 3:42 PM"). A screen reader read that word twice. The visible "Dismiss", "Clear" and "Copy" tooltips are unchanged.

Reported by:

@duytbp
