---
'@astryxdesign/cli': patch
---

[fix] Search: a family's root now leads a part of its own family when the part adds nothing the query asked for: `astryx search tabs` lists TabList before Tab. A query that holds a word only the part's name has, such as "item" for ListItem, keeps the part first. Matches, scores, reasons and counts are unchanged; only the order inside one score band moves.

@josephfarina
