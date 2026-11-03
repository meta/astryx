---
'@astryxdesign/core': patch
---

[fix] The internal calendar date parser reads back the text it writes in more locales. It reads month names that start with a number, such as Latvian `1. adars` for Adar I and `1. rabī` for Rabi' I, and still reads `1. adars` as day 1 of Adar when no other number can be the day. It reads a numeric pattern that uses two separators, such as the Hindi Buddhist format hint. In Amharic, Republic of China and Japanese dates of an earlier era now show the era, so `1/1/12 BROC` no longer reads as a date in 1923. No public API changes.

@nynexman4464
