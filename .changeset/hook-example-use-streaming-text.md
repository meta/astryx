---
'@astryxdesign/cli': patch
---

[docs] Fix the `useStreamingText — Streaming Response` example block: it passed `isStreaming` as `false`, so the streaming reveal it exists to show never ran. The block is now a chat-style reply card with a Regenerate button that streams the response in bursts — the hook reveals it steadily while streaming and snaps to the full text when it ends.

@LetMeSleep8h
