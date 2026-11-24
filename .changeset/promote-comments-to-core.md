---
'@astryxdesign/core': patch
---

[component] Promote the Comments family to Core, imported from `@astryxdesign/core/Comments` or the package root. `Comments` is a panel of comment threads and activity events in time order, with a composer for new comments. `CommentThread` is one thread on its own, such as a margin comment or a thread in a Popover. `CommentComposer` is the controlled composer they use: a growing input with typeahead triggers, agent commands, and image uploads, above attach and emoji buttons and Post. Threads carry replies, reactions, edit history, quoted passages, resolution, an agent's reply in progress, and failures with Retry; the host owns the data and every action. An app supplies its own emoji picker through `emojiPicker` and its own typing indicator through `typingIndicator`. A reaction's "who reacted" tooltip joins names with the locale's narrow list format.

@ernestt
