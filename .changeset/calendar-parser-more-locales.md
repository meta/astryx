---
'@astryxdesign/core': patch
---

[fix] The internal calendar date parser reads back the text it writes in more locales. It reads month names that start with a number, such as Latvian `1. adars` for Adar I and `1. rabī` for Rabi' I, and still reads `1. adars` as day 1 of Adar when no other number can be the day. It reads a numeric pattern that uses two separators, such as the Hindi Buddhist format hint. Amharic Japanese and ROC format hints always show the narrow era (`1/1/8 R`), keeping day/month/year order, because the locale's numeric pattern omits the era. The other Amharic format hints show their era the same way, such as `23/2/2019 AM`. In the short-month Amharic text, where every era width moves the fields, a date of an earlier era adds the era, so `1 ጃን 12 BROC` no longer reads as a date in 1923. No public API changes.

@nynexman4464
