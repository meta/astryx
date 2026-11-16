---
'@astryxdesign/cli': patch
---

[docs] The content page templates no longer have controls that do nothing: in `course-detail`, `documentation`, `documentation-technical`, `detail-page` and `work-item-detail`, every button, card and menu item now either works or shows a toast saying what the real app would do there ("Demo: … would … here"), the documentation banner's Get started is a link, and toasts that claimed an action had happened now say it would happen. Refund on `detail-page` is left unwired, because an irreversible action needs a confirm step. No layout or styling changes.

@josephfarina
