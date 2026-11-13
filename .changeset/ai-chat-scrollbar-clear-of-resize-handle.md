---
'@astryxdesign/cli': patch
---

[fix] In the AI Chat page template, the message list's scrollbar no longer sits under the artifact panel's resize handle. On desktop the chat column keeps a small gap before the handle, so the whole scrollbar scrolls the messages; before, a press on the half of the scrollbar nearest the handle resized the panel. Mobile, where the handle is hidden, is unchanged.

@charlie5188 @HelloOjasMutreja
