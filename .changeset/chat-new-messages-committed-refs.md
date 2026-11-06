---
'@astryxdesign/core': patch
---

[fix] `useChatNewMessages` (which `ChatLayout` uses), `useSpeechRecognition` and `useChatDictation` read their callbacks and other latest values as last committed. A render that React discards, as a suspended transition does, no longer has its callbacks called on the next resize or recognition event. Its audio context is no longer used either. After such a render, `useChatNewMessages` also no longer flags new messages while the list follows the bottom.

@vjeux
