---
'@astryxdesign/core': patch
---

[fix] Many components that show built-in text are smaller. Each one now carries only the English for its own strings instead of every Core string, so a component such as Button loads about 7 KB less (gzip) and a new string elsewhere in Core no longer makes it bigger. Table (and Markdown, which renders it), Chat, PowerSearch, CommandPalette and the date and time inputs still carry every Core string for now. Nothing you see changes: every built-in string still shows the same English, translations and overrides resolve as before, and `useTranslator`, `InternationalizationContext` and `@astryxdesign/core/locales/en.generated.js` still reach every Astryx string. (#9429)

@cixzhang
