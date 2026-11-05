---
'@astryxdesign/core': patch
---

[fix] Inserting a token through `ChatComposerInput`'s handle (`insertToken`) now reports the new value through `onChange` once, as typing does, and hides the placeholder. Before, a controlled host's Send button stayed disabled or sent a stale prompt.

@cixzhang
