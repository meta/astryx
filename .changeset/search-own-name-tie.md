---
'@astryxdesign/cli': patch
---

[fix] Search: when matches tie for first place on score and on the query words they matched, the one whose own name holds more of the query's words now comes first, instead of the first by name. `astryx search "side navigation sidebar"` lists SideNav first. A first result that matched the whole query, as a name, keyword or title, keeps its place: `astryx search "date picker"` keeps Calendar first. A part of the first result never takes its place this way. Matches, scores, reasons and counts are unchanged; only the order inside one score band moves.

@josephfarina
