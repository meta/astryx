---
'@astryxdesign/cli': patch
---

[experimental] In `astryx experimental theme editor how`, an undo that names a second change after it ("Undo the card change and the heading change") takes back each change said earlier, instead of taking back none. An undo that names a look ("Undo the heading size change" after a size and a bold) takes back only that look. An undo of a part with a longer name ("Undo the button group change") takes back that part's change only, never a change to a shorter part inside its name (the buttons). As before, a part's size undo ("Undo the button size change"), a part named by its whole name, and an undo of the text ("Undo the text change") take back their earlier change.

@josephfarina
