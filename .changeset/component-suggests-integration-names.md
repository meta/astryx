---
'@astryxdesign/cli': patch
---

[fix] `astryx component <Name>` with a name that is not a component now suggests the components of your project's integrations, not only Core's. A typo of an integration component's name (`ZorbletCrd` for `ZorbletCard`), or its name without its package's prefix, gets that component as a suggestion, matched by the same rule as a Core component: name, keywords and description. Two adjacent letters swapped in a name (`Butotn`) now count as one slip, as a one-letter typo does, and so does one slip in a name typed as words (`hover crad` or `hover-crd` for `HoverCard`): that name comes before a component that only has the words as a keyword. Only a Core component still resolves by a close match, and the suggestion count rules are unchanged.

@josephfarina
