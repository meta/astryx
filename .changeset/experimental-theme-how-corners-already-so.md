---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: a corner ask the part already answers ("tabs rounded on top" on tabs at `4px 4px 0 0`) writes nothing and leads with "already so … nothing to change", never with "No command does all of …". A corner ask also reads the corner longhands the theme set on the part after its radius, so tabs at `4px 4px 0 0` with a later bottom-right corner of `8px` are not already square at the bottom.

@josephfarina
