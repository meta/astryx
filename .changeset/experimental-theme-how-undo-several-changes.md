---
'@astryxdesign/cli': patch
---

[experimental] In `astryx experimental theme editor how`, an undo that names several changes of the parts it names ("Undo the card change and the heading change", "Undo the heading size change and the heading weight change", "Undo the heading size and weight changes") takes back each change said earlier, each read for its own part and look, instead of taking back none; a part it names with no earlier change says there is nothing to take back there. An undo that names a look ("Undo the heading size change" after a size and a bold) takes back only that look. A following "… change" phrase that names a part with no change said earlier is read as before. As before, an undo takes back only the part it names ("Undo the button group change" keeps the buttons), and a part's size undo and an undo of the text take back their earlier change.

@josephfarina
