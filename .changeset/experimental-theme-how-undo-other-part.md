---
'@astryxdesign/cli': patch
---

[experimental] In `astryx experimental theme editor how`, a "… change" phrase after an undo that names one part ("Undo the heading change and the card corners change") is part of the undo, never a new change. When its part had no change said earlier, nothing is written for it and the answer says so, and the undo takes back its own part's change. When its part had one, that change is taken back too: "Undo the card change and the heading change" after both were changed takes back both, where it took back none before, and after only the headings changed takes back the headings and says no card change was said. A phrase on the undo's own part ("the heading size change and the heading bold change") names more than one change of that part, so none is taken back and the answer says so; it used to take back the first and write the second as new. A part said as its family ("the input change") counts its members. A step another clause also writes stays. A phrase naming two parts ("the card and button corners change"), or one whose look clashes with an earlier change, reads as before.

@josephfarina
