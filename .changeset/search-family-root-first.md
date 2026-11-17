---
'@astryxdesign/cli': patch
---

[fix] Search: a family's root now leads a part of its own family when the part adds nothing the query asked for: `astryx search tabs` lists TabList before Tab. A query that holds a word only the part's name has, in any plural form, such as "item" for ListItem or "statuses" for FieldStatus, keeps the part first. Scores, reasons and match counts are unchanged; only order inside a band moves.

@josephfarina
