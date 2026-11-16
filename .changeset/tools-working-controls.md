---
'@astryxdesign/cli': patch
---

[docs] The tool page templates now give their dead buttons and menu items a behavior: in `canvas-editor`, `file-explorer`, `ide`, `kanban-board` and `editor`, the toolbar buttons, menu items and view switch that did nothing now either work or shows a toast saying what the real app would do there ("Demo: … would … here"), and toasts that claimed an action had happened now say it would happen. Text fields, form inputs and some menus are not part of this change. No layout or styling changes.

@josephfarina
