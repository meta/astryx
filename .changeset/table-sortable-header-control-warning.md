---
'@astryxdesign/core': patch
---

[docs] Table: a sortable column whose header holds its own control (a button, link or input) now warns in development, and the Table docs say not to put a control in a sortable column's header. The Sort control wraps the whole header, so a control there nests inside it and assistive technology cannot operate it.

@cixzhang
