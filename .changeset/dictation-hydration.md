---
'@astryxdesign/core': patch
---

[fix] `useSpeechRecognition` and `ChatDictationButton`: a page rendered on the server no longer has a hydration mismatch. The server and the render that hydrates its markup both report `isSupported: false`, so they draw the same tree; the dictation button appears in the next render when the browser supports speech recognition.

@josephfarina
