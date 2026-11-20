---
'@astryxdesign/cli': patch
---

[experimental] In `astryx experimental theme editor how`, an undo that names a second change after it ("Undo the card change and the heading change") takes back each change said earlier, instead of taking back none. An undo that names a look ("Undo the heading size change" after a size and a bold) takes back only that look. As before, an undo takes back only the part it names ("Undo the button group change" keeps the buttons), a part's size undo ("Undo the button size change") and an undo of the text ("Undo the text change") take back their earlier change.

@josephfarina
