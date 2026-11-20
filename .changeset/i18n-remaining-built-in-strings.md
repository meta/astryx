---
'@astryxdesign/core': patch
---

[fix] Built-in text in six components that was fixed English now follows the locale. Through the catalog, so a provider's translation or override replaces it: Tokenizer's `+N more` overflow count, Slider's screen-reader "Required", CodeBlock's `<language> diff` header label, the default label of a token made by `useChatPasteAsToken` (the same message the pasted-text chip uses), and the relative-date choices in PowerSearch's popover editor (the touch sheet already translated them). Through the locale's own unit formatting: Timer's elapsed durations, which read `34s`, `2m 08s` and `1h 05m` in English as before and use the locale's unit names elsewhere (German `2 Min., 08 Sek.`). Other English output is unchanged, except that Tokenizer groups the digits of a count of 1,000 or more; Timer's units are never grouped (`1000h 05m`, as before). Shipped locales show English for the new catalog keys until translators add them.

@nynexman4464
