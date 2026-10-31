---
'@astryxdesign/richtext': patch
---

[feat] RichTextEditor: `hasHistory={false}` leaves out the editor's built-in undo and redo history, so a plugin passed in `plugins` that brings its own history, such as a collaboration plugin's undo manager, is the only one that records edits and answers undo and redo. The default keeps today's history.
@ernestt @emilyhorsman
