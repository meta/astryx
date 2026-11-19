---
'@astryxdesign/cli': patch
---

[experimental] `astryx docs cli/experimental/icon-sets` opens with the icon model in one place: Astryx owns generic meanings (a description and a few words each), a library maps its icons onto them inside its own package or the integration that already ships for it, with no separate add-on, a missing meaning is added in that package with `experimental icon new-definition`, and `astryx experimental icon <words>` puts the set's icon for the matching meaning first while related icons stay findable by their own words.

@josephfarina
