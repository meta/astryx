---
'@astryxdesign/cli': patch
---

[fix] Keyboard users can reach two template controls. The kanban board's column info icons use InfoTip, so each is a named button that Tab reaches and Enter opens, where before Tab stopped on a hidden, unnamed icon. In the side-navigation shell, a conversation's options button sits in the row's actions slot and shows while focus is in the row, so Tab reaches it; focus returns to it after its menu or delete confirmation closes, and the conversation link keeps its status in its name.

@josephfarina
