---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[docs] MobileNavToggle's docs now say every case where it renders nothing: above the mobile breakpoint, without an AppShell mobile context (AppShell's, or an `AppShellMobileContext` you provide), and when AppShell has no mobile navigation (no side or top nav, `mobileNav={false}`, or a `mobileNav` node).

@cixzhang
