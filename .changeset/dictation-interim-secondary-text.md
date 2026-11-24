---
'@astryxdesign/core': patch
---

[fix] `useChatDictation`'s interim words in a `ChatComposerInput` are readable. They show in italic secondary text at full opacity, which keeps 4.5:1 on the composer in every bundled theme, light and dark. Before, they used the disabled text color at 70% opacity: about 2.1:1 in Neutral light and 1.7:1 in Neutral dark.

@cixzhang
