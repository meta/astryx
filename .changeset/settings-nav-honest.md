---
'@astryxdesign/cli': patch
---

[fix] The settings and settings-sidebar page templates no longer offer nav items that lead nowhere. In settings, choosing an item other than Profile no longer moves the selection while the Profile form stays; in settings-sidebar, Notifications, Taxes, Payments and Travel for work no longer open an empty page. A nav item with a section works as before; an item without one shows a demo message and keeps the current item selected, and the current item is marked as the current page for screen readers. The first screen looks the same.

@josephfarina
