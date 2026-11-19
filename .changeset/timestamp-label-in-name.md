---
'@astryxdesign/core': patch
---

[fix] A relative `Timestamp` is now named by the words it shows, then the full date: "2 hours ago, March 25, 2026 at 10:00:00 AM Coordinated Universal Time". A button, link, or radio that contains it keeps its visible words in its name, so voice-control users can say what they see (WCAG 2.2 SC 2.5.3). A caller `aria-label` or `aria-labelledby` still names it instead.

@cixzhang
