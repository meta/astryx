---
'@astryxdesign/core': patch
---

[fix] Banner's dismiss button and a field's clear button no longer have their short tooltip read as a description. Their accessible names, such as "Dismiss Project A was archived" and "Clear Assignee", already contain the tooltip's word, so a screen reader read it twice. The visible "Dismiss" and "Clear" tooltips are unchanged.

Reported by:

@duytbp
