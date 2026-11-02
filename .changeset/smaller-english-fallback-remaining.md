---
'@astryxdesign/core': patch
---

[fix] Table, Markdown, Chat, CommandPalette and the date and time inputs are smaller too. Each now carries only the English for its own strings instead of every Core string, about 7 KB less (gzip) each. PowerSearch still carries every Core string, because a custom operator's `i18nKey` can name any Astryx key. Nothing you see changes: every built-in string shows the same English, and translations and overrides resolve as before. (#9452)

@cixzhang
