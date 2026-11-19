---
'@astryxdesign/cli': patch
---

[fix] The editor template's transactions table keeps names readable on a phone. Each column now has a floor (name 180px, date and amount 120px, actions 60px), and its share of the width matches that floor. The table needs at least 480px; in anything narrower, such as a phone, it scrolls sideways instead of squeezing names to a letter or two per line. Desktop windows that give the table 480px or more do not scroll; the name column takes a larger share and the actions column a smaller one.

@josephfarina
