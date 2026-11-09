---
'@astryxdesign/cli': patch
---

[fix] `astryx template <name>` puts the template a typo slips from first in its suggestions: a name one or two slips away (a letter added, dropped or changed, or two letters swapped, as in `AppShellCotnentOnly` or `dasbhoard`) ranks just below the templates that carry every typed word. The suggestion list is never longer than before.

@josephfarina
