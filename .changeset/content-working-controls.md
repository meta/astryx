---
'@astryxdesign/cli': patch
---

[docs] The content page templates now give their dead buttons and menu items a behavior: in `course-detail`, `documentation`, `documentation-technical`, `detail-page` and `work-item-detail`, the buttons, cards and menu items that did nothing now either work or show a toast saying what the real app would do there ("Demo: … would … here"), the documentation banner's Get started is a link, and toasts that claimed an action had happened now say it would happen. Refund on `detail-page` and Delete in `work-item-detail`'s attachment menus are left unwired, because an irreversible action needs a confirm step. No layout or styling changes.

@josephfarina
