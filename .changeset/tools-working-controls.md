---
'@astryxdesign/cli': patch
---

[docs] The tool page templates no longer have controls that do nothing: in `canvas-editor`, `file-explorer`, `ide`, `kanban-board` and `editor`, every toolbar button, menu item and view switch now either works or shows a toast saying what the real app would do there ("Demo: … would … here"), and toasts that claimed an action had happened now say it would happen. No layout or styling changes.

@josephfarina
