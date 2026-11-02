---
'@astryxdesign/core': patch
---

[fix] A disabled `SideNavItem` stays focusable. Before, it rendered a `<button>` with the native `disabled` attribute, so Tab skipped it and keyboard and screen-reader users could not reach it, and an item that became disabled while focused dropped focus to the page. Now it exposes `aria-disabled="true"` and keeps its Tab stop, while a click, Enter or Space still runs no `onClick`, does not navigate, and does not close the mobile drawer. In a collapsed rail, a disabled item's label tooltip now opens when Tab focuses it and describes the focusable control rather than its row. This meets the focusable-disabled requirement in spec:AST-085 (FR1, FR2, FR4, FR5). No API changes.

@kyu-rong
