---
'@astryxdesign/core': patch
---

[fix] `Table` names say what they belong to (WCAG 2.2 SC 4.1.2 and 2.4.6; the APG sortable table pattern under `spec:AST-020` FR15; `spec:AST-025` FR12).

- A sort button was named "Sort by Name", or "Sort by Name, sorted ascending" with "priority 2 of 3" in multi-sort, and that phrase replaced the column header's name. It is now named by its column's text, so the header keeps that name; the direction comes from the header's `aria-sort`, and while several columns sort, each button is described by its priority ("Priority 2 of 3").
- The scroll region was a group named "Table" on every table. It now takes the table's own name (its `aria-labelledby`, else its `aria-label`), and "Table" only for an unnamed table.

@cixzhang @duytbp
