---
'@astryxdesign/core': patch
---

[fix] AppShell keeps to the device's safe area on a phone page that opts into the full screen (`viewport-fit=cover`). The header's background reaches under the status bar and out to the screen's sides while its items stay clear of the status bar, the Dynamic Island and a landscape notch. The main content ends clear of the home indicator (its end padding grows by the bottom inset, so a child that fills it ends above the indicator), in the page or in the main region's own scroller. In landscape only the header is inset; an inline SideNav and the content's sides are not yet. Without `viewport-fit=cover` the insets are zero and nothing moves. The AppShell docs say how a page and an installed web app opt in.

@vjeux
