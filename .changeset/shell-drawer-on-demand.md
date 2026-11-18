---
'@astryxdesign/core': patch
---

[perf] `AppShell`, `SideNav` and `TopNav` load the mobile navigation drawer when a person first reaches for it: hovering, focusing or pressing the menu button, or any open. Until then the page carries an empty, closed placeholder, and the menu button still names it. First-load JavaScript drops by about 9,800 bytes gzip on a `TopNav` page and 8,400 bytes on an `AppShell` or `SideNav` page. The drawer opens and closes as before.

@cixzhang
