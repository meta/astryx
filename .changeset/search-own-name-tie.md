---
'@astryxdesign/cli': patch
---

[fix] Search: when matches of one domain tie for first place on score and on the query words they matched, the one whose own name holds more of the query's words now comes first, instead of the first by name. `astryx search "side navigation sidebar"` lists SideNav first. A first result that matched the whole query, as a name, keyword or title, or whose title the query holds, keeps its place: `astryx search "date picker"` keeps Calendar first, and `astryx search "how do i generate a palette"` keeps the theme authoring guide first. A part of the first result never takes its place this way. Matches, scores, reasons and counts are unchanged; only the order inside one score band moves.

@josephfarina
