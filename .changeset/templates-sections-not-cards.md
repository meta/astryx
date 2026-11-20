---
'@astryxdesign/cli': patch
---

[fix] The `dashboard-scorecard` and `dashboard-progress` templates no longer wrap whole page sections in cards, as Card's own guidance says: the scorecard's goal list, and the progress page's summary panels and workstream table, sit in plain page sections under their headings. Repeated items keep their cards: the scorecard's metric tiles, trend charts and commentary notes.

@josephfarina
