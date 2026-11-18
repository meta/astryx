---
'@astryxdesign/cli': patch
---

[experimental] When `astryx template` keeps an icon imported from a subpath of the library an icon set wraps, its reason names that library too: `it already comes from @heroicons/react/24/solid, part of @heroicons/react, which <set> wraps`, not the subpath alone as if the set wrapped it.

@josephfarina
