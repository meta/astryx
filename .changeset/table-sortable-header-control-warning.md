---
'@astryxdesign/core': patch
---

[fix] Table: in development, a sortable column whose header first renders holding its own control (a button, link, input or other tab stop) now warns that the control nests inside the Sort button, where assistive technology cannot operate it. The Table docs also say not to put a control in a sortable column's header.

@cixzhang
