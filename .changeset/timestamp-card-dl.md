---
'@astryxdesign/core': patch
---

[fix] Timestamp: every value in the hover card now has a name for screen readers (WCAG 2.2 1.3.1). A copy button sits inside its row's value, so the card passes the description-list check, and a row without a label is named by its time zone's long name, which is visually hidden. (#9041)

@cixzhang
