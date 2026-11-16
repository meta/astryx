---
'@astryxdesign/cli': patch
---

[docs] The table page templates now give their dead buttons and menu items a behavior: in `table-inbox`, `table-tree`, `table-grouped`, `table-page` and `table-filter`, the buttons and menu items that did nothing now either work or show a toast saying what the real app would do there ("Demo: … would … here"), and toasts that claimed an action had happened now say it would happen. Delete actions are left unwired on purpose, because a destructive action needs a confirm step these templates do not have. Text fields, form inputs and some menus are not part of this change. No layout or styling changes.

@josephfarina
