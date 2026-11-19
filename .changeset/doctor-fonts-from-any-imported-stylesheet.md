---
'@astryxdesign/cli': patch
---

[fix] `doctor`'s theme font check now counts a family as loaded when any font stylesheet that the generated theme module imports loads it. A local theme built on neutral, such as one whose source extends neutral or a copy that `theme eject` makes, names neutral's fonts but ships no font stylesheet of its own. Before, `doctor` warned "Added themes name font families but import no font stylesheet (<theme>: Figtree (font stylesheet is not imported))", even when the app also added neutral and the module imported neutral's font stylesheet. A family that no imported font stylesheet loads still gets that warning.

@josephfarina
