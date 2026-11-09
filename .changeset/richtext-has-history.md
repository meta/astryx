---
'@astryxdesign/richtext': patch
---

[feat] RichTextEditor: `hasHistory={false}` leaves out the editor's built-in undo and redo history, so a plugin passed in `plugins` that brings its own history, such as Lexical's `HistoryPlugin` with its own settings, is the only one that records edits and answers undo and redo. The editor reads `hasHistory` once, when it mounts. The default keeps today's history.
@ernestt @emilyhorsman
