---
'@astryxdesign/cli': patch
---

[fix] `astryx build` reads a page template's name however it is written: "a KanbanBoard page", "a kanban-board page" and a one-letter slip such as "a kanban bord page" start where "a kanban board page" does. A run of words that names a template whole is read as that template's words; a slip counts only in a word no template's description uses, so real words are never respelled.

@josephfarina
