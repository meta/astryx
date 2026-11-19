---
'@astryxdesign/cli': patch
---

[fix] `astryx doctor` now warns when the app's default theme needs its page color shown and nothing paints the page: a theme drawn for one mode (its text lands on the browser's own page color in the other OS mode), or a local theme that sets its own page color, different from its base's (the color chosen never shows). AppShell, a body background of the page color, or, for a one-mode theme, the theme's own mode on the root `Theme` paints it. Doctor warns only when it can prove nothing paints the page; anything it cannot read stays silent. A project that loads no Core reset is embedded in a page it does not own and gets no warning. The fix says to wrap the page in `AppShell`, or else to add `body { background: var(--color-background-body) }` to global CSS.

@josephfarina
