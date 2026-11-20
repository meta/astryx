---
'@astryxdesign/cli': patch
---

[experimental] In `astryx experimental theme editor how`, an undo that names a second change after it ("Undo the card change and the heading change") takes back each change said earlier, instead of taking back none. An undo that names a look ("Undo the heading size change" after a size and a bold) takes back only that look, and a part's size is its text size or its room ("Undo the button size change" after "bigger buttons"). An undo names a part by its whole name, and an undo of the text ("Undo the text change") takes back the text's earlier change.

@josephfarina
