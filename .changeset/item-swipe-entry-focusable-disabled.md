---
'@astryxdesign/core': patch
---

[fix] A disabled swipe action on an `Item` row now stays focusable while the row is swiped open. Before, it rendered a `<button>` with the native `disabled` attribute, so Tab skipped it and a keyboard or screen-reader user could not reach it to learn it exists. Now it exposes `aria-disabled="true"` and keeps its Tab stop, while a click, Enter or Space still runs no `onActivate`, leaves the row open, and does not reach the row's own `onClick` (`spec:AST-085` FR1, FR2). No API changes.

@parinith-web
