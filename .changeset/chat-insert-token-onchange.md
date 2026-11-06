---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[fix] Inserting a token through `ChatComposerInput`'s handle (`insertToken`) now reports the new value through `onChange` once, as typing does, and hides the placeholder. Before, a controlled host's Send button stayed disabled or sent a stale prompt. The `ai-chat-landing` page template drops the input-event workaround it used to sync the composer after an insert. (#10167)

@cixzhang
