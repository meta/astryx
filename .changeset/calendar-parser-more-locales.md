---
'@astryxdesign/core': patch
---

[fix] The internal calendar date parser reads back the text it writes in more locales. It reads month names that start with a number, such as Latvian `1. adars` for Adar I and `1. rabī` for Rabi' I, and still reads `1. adars` as day 1 of Adar when no other number can be the day. It reads a numeric pattern that uses two separators, such as the Hindi Buddhist format hint. In the Japanese and Minguo calendars, whose era changes between 1900 and 2100, a year without its era can read as the wrong date. There, a format hint that would otherwise leave out the era shows the narrow era when it keeps the locale's field order, such as Amharic `1/1/8 R`. Where every era width moves the fields, a date of an earlier era adds the era, such as Colognian `BROC 1. Jan. 12`, which no longer reads as a date in 1923. Calendars with one era in that range, such as Buddhist, Ethiopic or Hijri, write the same text as before. No public API changes.

@nynexman4464
