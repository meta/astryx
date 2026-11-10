---
'@astryxdesign/core': patch
---

[fix] createISOTimeString answers null unless the trimmed string is H:M or H:M:S with one or two digits per field (a seconds fraction is still accepted and dropped), instead of reading "2:30 PM" as 02:30 (12 hours off) and "14:30abc" as 14:30
@bstcoc
