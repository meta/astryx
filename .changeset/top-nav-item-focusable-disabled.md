---
'@astryxdesign/core': patch
---

[fix] A disabled `TopNavItem` now keeps its Tab stop, in both the bar and the drawer. Before, it rendered with `tabIndex={-1}`, so Tab skipped it and keyboard and screen-reader users could not reach it. Now it is a focusable `link` that exposes `aria-disabled="true"`, while a click, Enter or Space still runs no `onClick` or `onKeyDown`, does not navigate, and does not close the mobile drawer (`spec:AST-085` FR1, FR2, FR5, `TopNavItem` FR3). No API changes.

@parinith-web
