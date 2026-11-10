---
'@astryxdesign/core': patch
---

[fix] createISOTimeString answers null for a field with anything but digits, instead of reading "2:30 PM" as 02:30 (12 hours off) and "14:30abc" as 14:30
@bstcoc
