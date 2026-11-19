---
'@astryxdesign/cli': patch
---

[fix] The kanban-board page template stacks its lanes top to bottom at the full width below 768px, so a phone shows whole lanes instead of one lane and a cut edge of the next. A swipe that starts on a card now scrolls the board; a finger lifts a card with a long press. Mouse and pen drag as before, and the board at 768px and wider is unchanged.

@josephfarina
