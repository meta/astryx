---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme …`: undo and pasted forms are read as typed. `undo t 'cornres pill'` names the setting the typo means, and a setting the theme does not hold gets `show`, never a step back that would remove another change. Bare words for undo that are a held setting's value (`corners pill accent`) are read as that value. A setting's name where the theme goes, in other letters or as a token (`undo Corners`, `undo --color-accent`, `show Corners`), offers the themes to look at, never a new theme of that name. Several lines pasted as one argument give one line each. An empty pasted object with a separator (`{,}`) points to the dials. A pasted label that is a part typo (`(crad)`) is read as that part and a state (`(hover)`) as the state; a label that is no mode is never dropped for a line that changes both modes. A damaged saved entry beside a clean one of the same scope gets only its undo, never a set over the clean entry.

@josephfarina
