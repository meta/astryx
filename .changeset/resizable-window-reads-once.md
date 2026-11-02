---
'@astryxdesign/core': patch
---

[fix] `useResizable` (and every component that uses it, such as `SideNav`) no longer reads the window size again after each render it commits. That read forced a layout of the whole page inside every commit, so a tab switch under an `AppShell` with a `SideNav` paid for it on slow devices. The window is still read during render, and every size, bound and reported maximum is unchanged.

@cixzhang
