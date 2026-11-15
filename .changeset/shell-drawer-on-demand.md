---
'@astryxdesign/core': patch
---

[perf] `AppShell`, `SideNav` and `TopNav` load the mobile navigation drawer when a person first reaches for it: hovering, focusing or pressing the menu button, or any open. Until then the page carries an empty, closed placeholder, and the menu button still names it. First-load JavaScript drops by about 9.8 KB gzip on a `TopNav` page and 8.4 KB on an `AppShell` or `SideNav` page. The drawer opens and closes as before.

@cixzhang
