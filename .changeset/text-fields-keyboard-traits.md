---
'@astryxdesign/core': patch
---

[feat] TextInput and TextArea tell a touch keyboard what the field holds. New props `enterKeyHint` (what the Return key says: Search, Send, Next, Go, Done), `inputMode` (which keyboard: number pad, decimal pad, phone pad, web search, email, URL), `autoCapitalize` and `hasAutoCorrect`, plus `hasSpellCheck` on TextInput (TextArea already had it). TextInput's `type` also accepts `search`, `tel` and `url`. Each prop renders the native attribute of the same name and nothing when unset, so existing fields keep the browser's defaults.

@vjeux
