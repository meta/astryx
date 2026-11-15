---
'@astryxdesign/cli': patch
---

[fix] `astryx build` reads a page template's name written joined or with one swapped pair of letters: "a KanbanBoard page", "a CheckoutWizard page" and "a kanabn board page" start where the spaced name does. Only a whole template name counts, and a slip counts only as a swap of two neighbouring letters in a word of six or more letters, so everyday words are not respelled into template names.

@josephfarina
