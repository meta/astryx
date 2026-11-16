---
'@astryxdesign/cli': patch
---

[fix] Two page templates work fully from the keyboard. The kanban board's column info icons use InfoTip, so each is a named button that keyboard users can reach and open, where before Tab stopped on a hidden, unnamed icon. In the side-navigation shell, a conversation's options button shows while focus is in its row, so Tab can reach it, and focus returns to it after its menu or delete confirmation closes.

@josephfarina
