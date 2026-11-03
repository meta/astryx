---
'@astryxdesign/core': patch
---

[feat] AppShell keeps its header items and the end of its content inside the device's safe area on a phone page that opts into the full screen (`viewport-fit=cover`). A header region or the phone top bar reaches under the status bar and out to the screen's sides while its items stay clear of the status bar, the Dynamic Island and a landscape notch. In `height="auto"`, a phone top bar below a banner sticks under the top inset instead of at the top edge, so its items stay clear when the page scrolls. The main content ends clear of the home indicator (its block-end padding is `contentPadding` plus the bottom inset, so a child that fills it ends above the indicator), in the page or in the main region's own scroller. A shell with no header region or phone top bar takes no top inset, so its content keeps its own top padding there. In landscape only the header is inset, not an inline SideNav or the content's sides. Without `viewport-fit=cover` the insets are zero and nothing moves. The AppShell docs say how a page and an installed web app opt in.

@vjeux
