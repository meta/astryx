---
'@astryxdesign/core': patch
---

[chore] Internal: DateInput and DateTimeInput keep their typed-entry state, rejection status, and commits in one shared hook instead of two copies. Typing, committing, and rejection messages are unchanged. Not exported from the package entry point.

@nynexman4464
