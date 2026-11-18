---
'@astryxdesign/core': patch
---

[fix] Table: in development, a sortable column whose header first renders holding its own control (a button, link, input, an element with a role such as button or checkbox, or an element with a positive tab index) now warns that the control nests inside the Sort button, where assistive technology cannot operate it. The Table docs also say not to put a control in a sortable column's header.

@cixzhang
